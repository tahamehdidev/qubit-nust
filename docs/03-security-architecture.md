# Qubit — NUST — Security Architecture

**Status:** Finalized
**Phase:** Security Architecture (Step 3 of pre-implementation design)
**Last updated:** June 2026
**Depends on:** `01-data-model.md`, `02-api-contract.md` (both amended during this step — see their amendment notes)

This document specifies the concrete mechanisms behind every security *policy* already stated in the API contract. The contract said *what* (e.g. "instructor, own cohort only"); this document says *how* — exact algorithms, exact lifetimes, exact middleware structure, exact limits. A policy with no mechanism is just a sentence; this document is where the sentence becomes something that can actually be implemented correctly.

---

## How to Read This Document

- **Section 1** — password hashing
- **Section 2** — JWT mechanics: token lifetimes, payload shape, refresh rotation, revocation
- **Section 3** — RBAC middleware: role checks, ownership checks, how they compose
- **Section 4** — rate limiting, endpoint by endpoint, including several deliberate non-limits
- **Section 5** — input validation strategy (closes the `JSONB` gap flagged in `01-data-model.md` since Step 1)
- **Section 6** — CORS and transport security
- **Section 7** — cascading delete confirmation
- **Section 8** — the audit log: the mitigation for a compromised-admin actor, added during Step 6
- **Section 9** — a running list of every schema amendment this and the threat-modeling step produced, for cross-reference against `01-data-model.md`

---

## 1. Password Hashing

### 1.1 Algorithm

**argon2id**, the hybrid variant — resists both GPU-parallelized brute-force (via its memory cost) and side-channel attacks (via the hybrid design), which is specifically why it won the Password Hashing Competition and is the current OWASP recommendation, ahead of bcrypt.

### 1.2 Parameters — hardcoded, not environment-configurable

```javascript
import argon2 from "argon2";

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP minimum recommendation
  timeCost: 2,
  parallelism: 1,
};
```

**Hardcoded deliberately:** security-critical configuration that's too flexible creates its own risk — an `.env` value set low "for local dev speed" can silently ship to production if an environment variable is copied carelessly between environments. Hardcoding means changing the cost factor later requires a deliberate code change and review, not a one-line environment edit. If the cost factor is ever increased, `argon2.verify()` continues to work correctly against old hashes, since the parameters used are embedded in the stored hash string — no rehashing of existing users is needed.

**If hashing fails at server startup** (e.g. while computing the dummy hash used in 1.3), the server must fail to start entirely, rather than silently skipping the timing-safety measure below.

### 1.3 Timing-safe login verification

**The gap this closes:** if `/auth/login` looks up the user first and only calls `argon2.verify()` when a user is found, a nonexistent email returns measurably faster than a wrong password for a real account — leaking which emails are registered, even though both cases return the same error message.

```javascript
const DUMMY_HASH = await argon2.hash(crypto.randomBytes(32).toString("hex"), HASH_OPTIONS);
// computed once at server startup; its value is never meaningful, only its cost

async function login(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await userRepository.findByEmail(normalizedEmail);
  const hashToCompare = user ? user.passwordHash : DUMMY_HASH;
  const isValid = await argon2.verify(hashToCompare, password);

  if (!user || !isValid) {
    throw new AuthError("INVALID_CREDENTIALS"); // identical error, identical ~250-500ms timing, either case
  }
  return user;
}
```

### 1.4 Email normalization — one shared rule, used everywhere

`email.trim().toLowerCase()` is applied identically everywhere an email is used as a lookup or rate-limit key: signup duplicate-check, login lookup, and the login rate limiter's key. Without this, the database's `UNIQUE` constraint on `email` and the rate limiter's per-account key could disagree about whether `Attacker@x.com` and `attacker@x.com` are "the same account" — a real, exploitable inconsistency if left unnormalized in only one of the two places.

---

## 2. JWT Mechanics

### 2.1 Token lifetimes

| Token | Lifetime | Storage |
|---|---|---|
| Access token | 15 minutes | In-memory / React state on frontend — never `localStorage` |
| Refresh token | 7 days | `httpOnly`, `Secure`, `SameSite=Strict` cookie — holds in every environment, including the split Vercel/Render deploy (Section 6.2's deployment note, Section 6.3) |

15 minutes bounds the damage of a leaked access token to a narrow window without forcing constant re-authentication. 7 days matches realistic usage (a student working through coursework across a week) while the revocation mechanism below means that window is not a guaranteed 7 days of exposure if something goes wrong — it can be cut short immediately.

### 2.2 Access token payload

```json
{
  "sub": "uuid-of-user",
  "role": "learner",
  "email": "student@nust.edu.pk",
  "jti": "id-of-paired-RefreshToken-row",
  "iat": 1750000000,
  "exp": 1750000900
}
```

**Known, accepted tradeoff:** JWT payloads are signed but not encrypted — anyone holding the token can decode and read it. The `role` claim is frozen at issuance; if a role is ever changed mid-session (no such endpoint exists yet, per `02-api-contract.md` Section 0.1, but the schema doesn't forbid an admin from updating `User.role` directly), the holder's existing access token still claims the old role for up to 15 more minutes. Accepted given the short expiry bounds the window.

### 2.3 The refresh token itself is not a JWT

It is an opaque random value (`crypto.randomBytes(32).toString("hex")`), never decoded for claims — only checked for existence and validity by looking up its hash in the `RefreshToken` table. Only the access token needs JWT structure, since it's the one verified locally on every request without a database hit.

### 2.4 Verification flow, per request

```
1. Request arrives with Authorization: Bearer <token>
2. Verify JWT signature using JWT_ACCESS_SECRET; reject if invalid or expired → 401 UNAUTHENTICATED
3. Look up RefreshToken row by payload.jti
4. If row doesn't exist, or revoked_at is not null → 401 UNAUTHENTICATED (token was explicitly revoked, e.g. by logout)
5. Otherwise: req.user = { id: payload.sub, role: payload.role, email: payload.email }
6. Proceed to role check / ownership check middleware, then the controller
```

### 2.5 Why logout invalidation reuses `RefreshToken` instead of a separate blocklist

An earlier design considered a standalone in-memory access-token blocklist keyed by `jti`. That was rejected: an in-memory structure is wiped on every server restart or deploy, meaning a token revoked by logout would silently become valid again until its natural expiry — undoing the logout. Reusing `RefreshToken` (by setting the access token's `jti` to its paired session row's id) achieves the same revocation with zero new infrastructure, and persists naturally because the table itself is already persisted.

**Stated cost:** this reintroduces a database lookup on every authenticated request, which is the exact overhead JWTs are normally used to avoid. Accepted for this deployment's scale (a lab cohort, not high-traffic consumer load) — revisit if the platform ever needs to shed that cost.

### 2.6 Refresh token rotation (single-use)

**Why rotation, not reusable tokens:** a reusable refresh token that's silently copied (e.g. from a compromised device) lets both the legitimate user and an attacker use their copies indefinitely and simultaneously, with no signal anything is wrong. Rotation means the *first* use by either party invalidates the token — the other party's next attempt fails visibly, which is a detectable signal rather than silent indefinite compromise.

**The race condition this requires guarding against:** if the same token is submitted twice at the exact same moment (a true concurrent race, not sequential reuse), a naive check-then-update could let both requests see "still valid" and both rotate successfully. The fix is an atomic, conditional update — not application-level check-then-act:

```sql
UPDATE refresh_token
SET revoked_at = now()
WHERE id = $1 AND revoked_at IS NULL
RETURNING *;
```

PostgreSQL serializes concurrent writes to the same row — only one of two simultaneous requests can match `WHERE revoked_at IS NULL` and successfully update; the other affects zero rows.

```javascript
async function refresh(req, res) {
  const oldTokenHash = hash(req.cookies.refreshToken);
  const session = await refreshTokenRepository.revokeIfActive(oldTokenHash); // the atomic UPDATE above

  if (!session) {
    // Token never existed, already expired/revoked, or lost the race to a concurrent request.
    // All three cases return the same generic response — distinguishing them isn't useful
    // and could leak which case occurred.
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Session expired. Please log in again." } });
  }

  const newRawToken = crypto.randomBytes(32).toString("hex");
  const newSession = await refreshTokenRepository.create({
    userId: session.userId,
    tokenHash: hash(newRawToken),
    expiresAt: addDays(now(), 7),
  });

  const newAccessToken = jwt.sign(
    { sub: session.userId, role: user.role, email: user.email, jti: newSession.id },
    JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
  );

  res.cookie("refreshToken", newRawToken, { httpOnly: true, secure: true, sameSite: "strict" });
  res.json({ accessToken: newAccessToken });
}
```

**Reuse-of-revoked-token handling:** if a request ever presents a token whose row has `revoked_at IS NOT NULL` (i.e., it was already rotated out), this is treated as a compromise signal: the server revokes **every** `RefreshToken` row for that user (the same logic as `/auth/logout-all`), forcing re-authentication on all devices. This is stricter than necessary for an innocent cause (e.g. a stale browser tab racing a legitimate rotation from another tab), but the alternative — silently allowing reuse — is exactly the vulnerability rotation exists to close.

### 2.7 Login vs. logout-all ordering (checked, not a gap)

A concurrent login and a `logout-all` call for the same user cannot interleave incorrectly: `logout-all`'s `UPDATE ... WHERE user_id = $1 AND revoked_at IS NULL` only affects rows that already exist and are committed at the moment it executes. A simultaneous login's `INSERT` either commits before or after that `UPDATE` — there is no ordering under standard SQL transaction semantics where the `UPDATE` retroactively catches a row inserted after it ran. No fix needed; documented here so this was verified, not overlooked.

### 2.8 RefreshToken cleanup job

Unlike `CohortEnrollment` history (kept because it has real downstream value — see Section 3.3), an expired, unused `RefreshToken` row has none. Left unbounded, the table grows forever.

```sql
DELETE FROM refresh_token
WHERE expires_at < now() - INTERVAL '30 days';
```

Run as a daily scheduled job (cron, or an in-process scheduled task — no separate infrastructure needed at this scale). The 30-day grace period past expiry leaves a short buffer for debugging a session-related issue before the row disappears.

---

## 3. RBAC Middleware

### 3.1 Two kinds of check, never conflated

**Role check** — does this user's `role` permit this *type* of action at all? Answerable from `User.role` alone.

**Ownership check** — does *this specific* user have a relationship to *this specific* resource? Not answerable from `role` alone — requires a database query.

### 3.2 Global JWT verification, explicit public whitelist

JWT verification middleware runs on **every** route by default; public routes are explicitly listed as exceptions, not individually opted into authentication. This is the safer default: a forgotten whitelist entry produces an obviously broken (locked) route, which is noticed immediately — a forgotten per-route auth middleware call produces a silently public route, which might never be noticed.

```javascript
const PUBLIC_ROUTES = [
  { method: "POST", path: "/auth/signup" },
  { method: "POST", path: "/auth/login" },
  { method: "POST", path: "/auth/refresh" },
  { method: "GET", path: "/health" },
];

app.use((req, res, next) => {
  const isPublic = PUBLIC_ROUTES.some(r => r.method === req.method && r.path === req.path);
  if (isPublic) return next();
  return verifyJwt(req, res, next); // Section 2.4
});
```

### 3.3 Role check middleware

```javascript
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      // Defensive guard: should be unreachable if Section 3.2 ran correctly, but
      // prevents a raw 500 crash (reading .role off undefined) if a future route
      // is misconfigured into the public whitelist while still calling requireRole.
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Not authenticated." } });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." } });
    }
    next();
  };
}
```

Used as: `router.post("/courses", requireRole("admin", "instructor"), createCourseController)`.

### 3.4 Ownership check middleware — three variants, all repository-backed

All ownership-check middleware queries through the repository layer (`backend/src/repositories/`), never with inline SQL — consistent with the controller/service/repository layering established for the rest of the codebase. There is no "cross-cutting concern" exemption from this rule: keeping the rule absolute means there is exactly one place the database access pattern for each check lives, rather than two places that could each drift independently.

**ID format validation runs before any ownership query**, so a malformed ID is rejected with a clean `400` rather than reaching the database (where it could either crash the query or, worse, silently match zero rows and produce a `404` indistinguishable from "this resource genuinely doesn't exist"):

```javascript
function validateUuidParam(paramName) {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Invalid ${paramName} format.`, field: paramName } });
    }
    next();
  };
}
```
(An equivalent integer-format check is used for the non-UUID PKs — `Cohort`, `Course`, `Chapter`, `Lesson`, `Screen`, `Question`, `PracticeSet` all use integer PKs per `01-data-model.md`.)

**Variant A — Cohort ownership:**
```javascript
async function requireCohortOwnership(req, res, next) {
  if (req.user.role === "admin") return next(); // admins bypass every ownership check
  const cohort = await cohortRepository.findById(req.params.id);
  if (!cohort) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Cohort not found." } });
  if (cohort.instructorId !== req.user.id) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not own this cohort." } });
  }
  req.cohort = cohort; // cached, so the controller doesn't re-fetch it
  next();
}
```

**Variant B — Student-via-cohort ownership** (does this instructor have a teaching relationship with this student?):
```javascript
async function requireStudentOwnership(req, res, next) {
  if (req.user.role === "admin") return next();
  const targetUserId = req.query.userId ?? req.params.userId;
  const hasRelationship = await cohortEnrollmentRepository.existsForInstructor(req.user.id, targetUserId);
  if (!hasRelationship) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have access to this student's data." } });
  }
  next();
}
```
```javascript
// repositories/cohortEnrollmentRepository.js
async function existsForInstructor(instructorId, targetUserId) {
  const result = await db.query(
    `SELECT 1 FROM cohort_enrollment ce
     JOIN cohort c ON c.id = ce.cohort_id
     WHERE c.instructor_id = $1 AND ce.user_id = $2
     LIMIT 1`,
    [instructorId, targetUserId]
  );
  return result.rows.length > 0;
}
```
**Deliberately no `WHERE ce.status = 'active'` clause** — historical (`removed`) enrollments still count, so an instructor retains access to a student's historical attempt/progress data even after that student leaves their cohort. The absence of that filter *is* the decision; it exists so the history `CohortEnrollment.status` was designed to preserve (`01-data-model.md` Section 2) is actually usable, rather than preserved but unreachable.

**Variant C — Course ownership, with upward hierarchy resolution:**
```javascript
async function requireCourseOwnership(req, res, next) {
  if (req.user.role === "admin") return next();

  const courseId = req.params.courseId
    ?? (req.params.chapterId && await courseRepository.resolveFromChapterId(req.params.chapterId))
    ?? (req.params.lessonId && await courseRepository.resolveFromLessonId(req.params.lessonId))
    ?? (req.params.screenId && await courseRepository.resolveFromScreenId(req.params.screenId));

  const course = await courseRepository.findById(courseId);
  if (!course) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Course not found." } });
  if (course.createdById !== req.user.id) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not own this course." } });
  }
  req.course = course;
  next();
}
```
```javascript
// One join-up-the-chain resolver per level — e.g. for a lesson-level route:
async function resolveFromLessonId(lessonId) {
  const result = await db.query(
    `SELECT c.id FROM course c
     JOIN chapter ch ON ch.course_id = c.id
     JOIN lesson l ON l.chapter_id = ch.id
     WHERE l.id = $1`,
    [lessonId]
  );
  return result.rows[0]?.id ?? null;
}
// resolveFromChapterId and resolveFromScreenId follow the same shape, joining one level
// further up or down the Course -> Chapter -> Lesson -> Screen chain respectively.
```

**Applies to every Group 2 write, including creates under a parent** — e.g. `POST /courses/:id/chapters` checks ownership of the *parent* course before allowing a new chapter into it. Without this, any instructor could add content into another instructor's course even though they couldn't edit that course's *existing* content — an asymmetry that would otherwise go unnoticed.

**Variant D — `Question` edit access (Step 6 addition):** structurally different from the three variants above, because `Question` can't inherit ownership from a single parent — the same question can be attached to multiple courses owned by different instructors (the entire point of its M:N reusability, `01-data-model.md` Section 1). Edit access is therefore creator-OR-attached-to-an-owned-course, not simple ownership:

```javascript
async function requireQuestionEditAccess(req, res, next) {
  if (req.user.role === "admin") return next();

  const hasAccess = await questionService.checkEditAccess(req.user.id, req.params.id);
  if (!hasAccess) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have edit access to this question." } });
  }
  next();
}
```
```javascript
// services/question.service.js
async function checkEditAccess(instructorId, questionId) {
  const question = await questionRepository.findById(questionId);
  if (!question) throw new NotFoundError("Question not found.");

  if (question.createdById === instructorId) return true;

  // Or: has this instructor attached it to a course they own? Traverses both
  // junction-table paths (ScreenQuestion and PracticeSetQuestion) up to Course.
  return await questionRepository.isAttachedToInstructorsCourse(instructorId, questionId);
}
```

**Accepted tradeoff, stated plainly:** this is deliberately broader than ownership. Once shared, any instructor relying on a question can edit — or delete — it, which means any one of them can change or break it for the others, with no warning on deletion. This was confirmed twice during threat modeling rather than accepted by default — see `06-threat-model.md`, Instructor actor, Tampering.

**Cost note:** this is the most expensive ownership-equivalent check in the codebase, traversing two different junction-table paths up two different hierarchy depths. No dedicated rate limit was added — the caller pool is the same small, trusted instructor/admin group as other content-authoring endpoints, and the target is a single named question, not a broad enumerable surface (see `06-threat-model.md` for the comparison against why `GET /attempts`/`GET /progress` *did* need a limit despite a similarly expensive query). Worth a database index on the relevant foreign keys once implemented.

### 3.5 Full request flow, fully composed

For `GET /attempts?userId=:id` (instructor checking a specific student's history):

```
1. Global JWT middleware → decodes token, checks RefreshToken row not revoked, sets req.user
2. Rate-limiting middleware (Section 4) — always first among route-specific middleware
3. requireRole("instructor", "admin")
4. validateUuidParam("userId") + requireStudentOwnership
5. Controller → attemptService.getForUser(targetUserId)
6. Service → attemptRepository → fetches Attempt rows
7. Controller formats response, sends it
```

**Binding ordering rule:** rate-limiting middleware always runs first in any chain that has one — before JWT verification's downstream checks, before ownership checks, before the controller. This generalizes beyond the argon2-specific case that motivated it (Section 4.1): never perform expensive work before confirming a request is even allowed to be attempted at this rate.

### 3.6 Standing rule: the admin bypass applies only to ownership checks (Step 6)

Every ownership-check variant in Section 3.4 opens with `if (req.user.role === "admin") return next()`. This bypass exists because ownership questions are architecturally meaningless for admin — "does this admin own this specific cohort" has no real answer when the role grants platform-wide scope by definition.

**This bypass does not extend to role checks or input validation, with no exceptions.** A malformed `Question.content` blob is exactly as broken in the database whether an admin or an instructor submitted it — the database doesn't know or care who wrote it, and the Zod schemas in Section 5 apply identically regardless of caller role. Likewise, business-rule validation that isn't a pure ownership question (e.g. `POST /cohorts`' check that an admin-supplied `instructorId` actually references a user with `role = 'instructor'`, `02-api-contract.md` Section 6.3) still runs for admin callers — that check answers "is this request well-formed," not "does this admin own something," and the two questions are never the same question even when they're checked by similar-looking code.

Stated as a rule for any future endpoint: **before bypassing a check for `admin`, ask whether the check is an ownership question or a validation question. Only ownership questions are eligible to bypass.** This distinction was confirmed explicitly during threat modeling (`06-threat-model.md`, Admin actor, Tampering) rather than left implicit, specifically because "admin is trusted" is the kind of reasoning that's easy to over-apply by analogy to a new endpoint later if the actual boundary isn't written down.

---

## 4. Rate Limiting

### 4.1 Storage: in-memory

Rate-limit counters are stored in-process (e.g. via a library backed by an in-memory `Map`), not Redis. This is consistent with the deployment model already decided in the tooling-setup step: a single Render/Railway instance for a 3-month academic build, not a multi-instance deployment. Redis would solve a scaling problem this deployment doesn't have, at the cost of a real new dependency to provision and monitor. Revisit only if the platform ever moves to multiple backend instances.

### 4.2 Full limit table

| Endpoint | Per-IP | Per-account | Rationale |
|---|---|---|---|
| `POST /auth/login` | 20 / 15 min | 5 / 15 min, keyed on normalized email | Per-IP catches one script spraying attempts across many accounts; per-account catches distributed credential stuffing across many IPs against one account. 5 gives real headroom for human mistyping while making brute-force impractically slow. |
| `POST /auth/signup` | 5 / hour | — (no account exists yet) | Spam-account prevention. |
| `POST /auth/refresh` | None | — | Valid-token requirement considered sufficient. **Accepted gap:** no protection against a runaway frontend bug (e.g. a buggy `useEffect`) hammering this endpoint. Add a light per-IP limit if observed in practice. |
| `POST /auth/logout`, `/auth/logout-all` | — | 10 / min | Prevents logout-spam abuse of a stolen but still-valid access token. |
| `POST /auth/password-reset/request` | 5 / hour | — (caller is unauthenticated by definition) | Phase 7B.1. Per-IP only — keying on the submitted email would let an attacker fan requests out across many addresses to dodge a per-account limit entirely. Bounds mass-spamming arbitrary inboxes with reset links. |
| `POST /auth/password-reset/confirm` | 10 / 15 min | — | Phase 7B.1. Backstop against scripted guessing of the token's high-entropy random value (32 bytes, same generator as refresh tokens) — the token's own entropy is the primary defense. |
| `POST /attempts` | None | 60 / min | **Revised during threat modeling (Step 6).** Originally left fully unthrottled to avoid punishing fast legitimate learning activity, and grading is server-side so spamming doesn't improve outcomes — but the unlimited DoS/cost-inflation surface was judged worth bounding once explicitly examined under an adversarial lens. The limit is set far above plausible human throughput (a fast learner sustaining roughly one attempt every 2-3 seconds tops out around 20-30/min) specifically so it never affects genuine use, while still capping worst-case scripted flooding. |
| `GET /attempts?userId=:id`, `GET /progress?userId=:id` | — | 30 / min | Both run an ownership-check join query before fetching data — more expensive per call than a typical read. |
| `POST /cohorts/:id/students` | — | 20 / min | Reduces risk of using role-mismatch/duplicate-enrollment responses to enumerate real `learner` UUIDs. |
| `POST /cohorts/:id/students/bulk` | — | 20 / min (same limiter as the single-student route) | Phase 7B.2. Same actor/risk category (an authenticated instructor enrolling students), just a different request shape. |
| `POST /cohorts/join` | — | 10 / 15 min, keyed on the caller's own account | Phase 7B.2. Backstop against scripted guessing of the 8-character join code, on top of the code's own entropy (32^8 combinations). Per-account, not per-IP, since the caller is authenticated here (unlike password reset). |
| `POST /cohorts` (admin, with `instructorId` in body) | — | 10 / min, keyed on admin's own ID | Tighter than ordinary admin actions specifically because this is the one action in the contract that assigns ownership to a different user — closer to the mass-assignment risk class than routine content editing. |
| `GET /questions` (search) | — | 30 / min | Cheapest-to-abuse open read; reachable by any logged-in role, including `learner`. |
| Content-authoring writes (Groups 2–3) | None | — | **Accepted gap.** Already filtered to a small, trusted role group; rate limiting isn't the layer that protects against a compromised instructor/admin account — if one is compromised, the account's existing permissions are the real exposure, not how fast it can call this endpoint. |
| `DELETE /courses/:id` (and chapter/lesson equivalents) | — | — | Protected by `?confirm=true` instead (Section 7) — a different kind of safeguard, for a different threat (accidental destructive action, not request volume). |

### 4.3 Exceeding any limit

`429 Too Many Requests`, standardized error shape:
```json
{ "error": { "code": "RATE_LIMITED", "message": "Too many requests. Please try again later." } }
```

---

## 5. Input Validation Strategy

### 5.1 One mechanism for every endpoint, not just JSONB

Every request body in this contract — from simple fields (`email`, `name`, `title`) to the complex `JSONB` content columns — is validated via **Zod schemas**, applied as middleware before the controller runs. This was a deliberate choice over reserving Zod for only the complex cases: two different validation mechanisms (hand-written `if` checks for simple fields, Zod for complex ones) means two different error-handling code paths and a real risk the hand-written checks drift to be less rigorous over time, with nothing forcing them to stay consistent.

```javascript
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: firstIssue.message, field: firstIssue.path.join(".") },
      });
    }
    req.validatedBody = result.data; // controllers use this, never raw req.body
    next();
  };
}
```
```javascript
const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

router.post("/auth/signup", validateBody(SignupSchema), signupController);
```

**Concrete consequence:** every `POST`/`PATCH` endpoint in `02-api-contract.md` needs a corresponding Zod schema defined before implementation starts. This is real, enumerable work — roughly one schema per write endpoint — not a one-time setup cost, and should be tracked as such in the implementation task list.

### 5.2 `Question.content` — schema branches on the sibling `type` field

A single fixed schema cannot validate `content` correctly, since its expected shape depends on `Question.type` (`mcq` / `drag_drop` / `numeric`). Validation runs in the **controller**, not the service or repository — consistent with the controller's existing responsibility for input-shape validation; this is a more complex instance of that same job, not a new category of work.

```javascript
const McqContentSchema = z.object({
  options: z.array(z.string()).min(2),
  correctOptionIndex: z.number().int().min(0),
});
const DragDropContentSchema = z.object({
  items: z.array(z.string()),
  correctOrder: z.array(z.number().int()),
});
const NumericContentSchema = z.object({
  correctValue: z.number(),
  tolerance: z.number().min(0).optional(),
});

function validateQuestionContent(type, content) {
  const schema = { mcq: McqContentSchema, drag_drop: DragDropContentSchema, numeric: NumericContentSchema }[type];
  if (!schema) throw new ValidationError("VALIDATION_ERROR", `Unknown question type: ${type}`);
  return schema.parse(content); // throws a descriptive ZodError if the shape is wrong
}
```

### 5.3 `Screen.content` — same pattern, branching on `Screen.type`

```javascript
const SimulationContentSchema = z.object({
  widgetType: z.enum(["bloch_sphere", "circuit_builder", "shors_walkthrough"]),
  params: z.record(z.unknown()), // deliberately loose — see note below
});

function validateScreenContent(type, content) {
  const schema = {
    explanation: z.object({ text: z.string().min(1) }),
    question: z.object({}).passthrough(), // the actual question content lives on the attached Question row, not here
    simulation: SimulationContentSchema,
  }[type];
  if (!schema) throw new ValidationError("VALIDATION_ERROR", `Unknown screen type: ${type}`);
  return schema.parse(content);
}
```

**`SimulationContentSchema` is a deliberate placeholder, not an oversight.** A fully strict schema would mean guessing at widget internals (Bloch sphere, circuit builder) that haven't been built yet, and would need rewriting once their real shapes are known — wasted, possibly misleading work. But no schema at all would silently reopen the exact gap this section exists to close. `params: z.record(z.unknown())` confirms `params` is genuinely an object (rejecting a string, array, or `null` sent by mistake) without yet constraining its internals — a real, meaningful check, intentionally incomplete. Tighten this into a proper per-widget schema once each widget's actual shape is known during implementation.

### 5.4 Validation failure response

Always the standardized shape from `02-api-contract.md` Section 0.3, code `VALIDATION_ERROR`.

---

## 6. CORS and Transport Security

### 6.1 CORS

```javascript
import cors from "cors";

app.use(cors({
  origin: process.env.FRONTEND_URL, // exactly one trusted origin per environment — never a hardcoded list, never a wildcard
  credentials: true, // required for the httpOnly refresh-token cookie to be sent at all
  methods: ["GET", "POST", "PATCH", "DELETE"],
}));
```

**Why this connects directly to the refresh-token design:** an overly permissive CORS policy (wildcard origin) combined with `credentials: true` would defeat the `httpOnly` cookie protection relied on in Section 2 — a malicious site could embed a request to this API, and a wide-open CORS policy would let the browser attach the refresh-token cookie to it automatically.

**Origins are environment-driven, never hardcoded as a list including `localhost`.** Hardcoding both the dev and production URLs together would mean the production server accepts CORS requests claiming to originate from `localhost` in every environment, forever — not exploitable by an outside attacker (a real browser can't lie about its own origin), but unnecessary permission with no purpose. `FRONTEND_URL` is set per-environment instead (already present in `backend/.env.example` from the tooling-setup step; this section is what makes that variable's purpose concrete).

### 6.2 Transport security

| Rule | Why |
|---|---|
| HTTPS enforced in production | The refresh-token cookie's `Secure` flag means it will not be sent at all over a plain HTTP connection — HTTPS isn't independently optional once `Secure` is set; the two are coupled by design. |
| `Strict-Transport-Security` header set in production | Tells browsers to always use HTTPS for this domain, even if a user manually types `http://` or follows an old plain-HTTP link — closes the brief interception window before an HTTP→HTTPS redirect would otherwise occur. |

Both are typically provided by the hosting platform (Render/Railway terminate TLS automatically) rather than application code — an infrastructure item to verify once deployed, not a code task.

**Deployment note:** the frontend and backend are hosted separately (Vercel and Render respectively), which would normally make every request between them cross-site — breaking a `SameSite=Strict` cookie entirely (the browser withholds it on any cross-site request), and relaxing to `SameSite=None` to work around that trades away a real protection for a fragile one: third-party cookies are exactly what Chrome and Safari increasingly block by default regardless of `SameSite`, which silently breaks real sessions for real visitors rather than failing loudly. The actual fix deployed here is architectural, not a cookie-policy compromise: `code/frontend/vercel.json` proxies `/api/*` requests to the Render backend through Vercel's own edge, so the browser only ever talks to the frontend's own domain. The refresh cookie is genuinely first-party as a result, and `SameSite=Strict` holds in every environment — see the two remaining direct-access cases this doesn't cover in Section 6.3's second bullet below.

### 6.3 CSRF — deliberately no token mechanism

**Classic cookie-riding CSRF has minimal surface here, so no CSRF-token mechanism is bolted on.** The reasoning, made explicit rather than assumed:

- State-changing requests (`POST`/`PATCH`/`DELETE`) authenticate via a **bearer access token in the `Authorization` header**, not an ambient cookie. A malicious site's cross-origin form submission or `fetch` can trigger the browser into *sending* the refresh cookie automatically, but it cannot read that cookie's value (`httpOnly`) or otherwise construct a valid `Authorization: Bearer <token>` header — so the request never carries the one credential the API actually checks for anything other than `/auth/refresh` itself.
- The refresh cookie is `sameSite: "strict"` in every environment (Section 2.1) — the strictest setting, meaning the browser withholds it entirely on any cross-site request, including top-level navigation. This holds in production specifically because the frontend's Vercel deploy proxies API calls through its own domain rather than calling Render directly (the deployment note above) — a browser visiting the real frontend never makes a genuinely cross-site request to the backend at all. Anyone who calls the Render backend's own URL directly (bypassing the proxy) is making a cross-site request by definition, and `SameSite=Strict` blocks the cookie there regardless — combined with CORS's single trusted origin (Section 6.1), that direct-access path isn't reachable with the cookie attached, or readable by a script on another origin, from anywhere but the real frontend.
- The one endpoint that *is* purely cookie-authenticated, `POST /auth/refresh`, only ever mints a new access token — it has no side effect an attacker would gain anything from forcing (no data changes, no privilege change), and `sameSite: "strict"` already blocks it cross-site regardless.

A synchronizer-token or double-submit-cookie CSRF mechanism would add a second stateful concept for no marginal protection this design doesn't already provide — the two controls above (bearer-token auth for anything that matters, `SameSite=Strict` for the one cookie-only endpoint) are the whole defense, not a placeholder for one.

---

## 7. Cascading Delete Confirmation

`Course → Chapter → Lesson → Screen` all cascade on delete at the database level (`01-data-model.md` Section 3). Because a `Course` could have hundreds of `Attempt` rows recorded against its content, an accidental top-level delete is a real, plausible risk — not a contrived one.

**API-layer safeguard:** `DELETE /courses/:id`, `DELETE /chapters/:id`, and `DELETE /lessons/:id` require an explicit `?confirm=true` query parameter. `DELETE /screens/:id` is exempt — screens are leaf nodes with nothing to cascade to, so the rule is scoped to "cascades to content," not "deletion in general."

| Condition | Response |
|---|---|
| `confirm` absent or not exactly `"true"` | `400 VALIDATION_ERROR` — message states what will be deleted and that `?confirm=true` is required |
| `confirm=true` present | Proceeds |

**This is a wire-level mechanism only.** The actual protection against accidental deletion belongs in the frontend's confirmation UI (a real dialog, ideally requiring the user to type the course/chapter/lesson name) — the API parameter is just what that UI is required to set. A frontend that hardcodes `?confirm=true` on every delete call defeats the safeguard entirely; this is a constraint on the frontend implementation, not just the backend's.

---

## 8. Audit Log (Step 6 addition)

### 8.1 What this defends against, and what it doesn't

Every check in Sections 3-7 assumes the actor operating the role is *not* the threat — they're trying to exceed their role's intended boundary, and role/ownership checks exist to stop that. The compromised/malicious-admin actor breaks that assumption entirely: the attacker already holds the role, so by definition there is no boundary check left to fail. **`AuditLog` is a detection-and-recovery control, not a prevention control.** It does not stop a malicious admin action. It ensures that action is traceable afterward — the difference between an unrecoverable mystery and a situation that can be investigated, partially undone, and learned from.

### 8.2 Append-only, enforced at the database level

A convention of "the codebase never writes `UPDATE`/`DELETE` for this table" defends against bugs, but not against this actor — a compromised admin (or anyone holding the application's own database credentials) isn't bound by what the existing code happens to contain, and could run `DELETE FROM audit_log` directly, bypassing the application entirely.

```sql
REVOKE UPDATE, DELETE ON audit_log FROM app_user;
GRANT INSERT, SELECT ON audit_log TO app_user;
```

Run once during database setup, not something the application does at runtime. This means the protection holds even in the worst case this threat model considers — full compromise of the running Node process — because it doesn't depend on the application's code being correct, or even running at all.

### 8.3 What gets logged — deliberately scoped, not exhaustive

Logging every request would be noisy, expensive, and would dilute the signal. Coverage is scoped to actions where the admin ownership-bypass specifically matters — places where the same action would be ownership-gated for an instructor, but isn't for admin:

| Logged action | Why |
|---|---|
| `course.deleted`, `chapter.deleted`, `lesson.deleted` | Cascading, irreversible, highest blast radius |
| `cohort.instructor_reassigned` | The one action that reassigns ownership to a different user — adjacent to the mass-assignment risk class already flagged for `POST /cohorts` (Section 3.6 connects to the same admin-trust boundary) |
| `cohort.deleted` | Removes an instructor's access to their own students |
| `user.role_assigned_via_seed_script` | Privilege elevation itself — see 8.4 |

**Accepted gap:** read operations are not logged. Mass data exfiltration via legitimate `GET` requests (e.g. systematically reading every cohort's roster) would leave no trace. Judged disproportionate to log for this deployment's scale — a small number of named admins, where the realistic failure mode is more likely a sudden visible incident (a deleted course) than quiet long-term scraping. Revisit if this deployment ever grows past a handful of trusted admins.

### 8.4 The seed script writes its own entry

`scripts/create-admin.js` (Section 0.1) runs outside the HTTP application entirely, with no controller to log through — without an explicit fix, the single most security-relevant action in the system (assigning an elevated role) would have no audit trail at all.

```javascript
// scripts/create-admin.js — amended
async function createAdmin(email, name, role) {
  const passwordHash = await argon2.hash(generatedPassword, HASH_OPTIONS); // same config as signup, Section 1.2
  const user = await db.query(
    `INSERT INTO "user" (email, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, name, passwordHash, role]
  );

  await db.query(
    `INSERT INTO audit_log (user_id, action, resource_type, resource_id, metadata)
     VALUES ($1, 'user.role_assigned_via_seed_script', 'User', $2, $3)`,
    [user.rows[0].id, user.rows[0].id, JSON.stringify({ assignedRole: role, ranBy: process.env.USER ?? "unknown" })]
  );
}
```

Note `user_id` here points at the **newly created account**, not whoever ran the script — consistent with every other audit entry's `user_id` meaning "the account this action was performed on/by." The weaker signal of who physically ran the script (a shell username, possibly shared) goes in `metadata` instead, since it can't be verified the way an authenticated session's `user_id` can be elsewhere in the table.

### 8.5 `GET /audit-log`

Read-only, `admin` only, per `02-api-contract.md` Section 8. No write access to this table exists via the API at all — every entry is created exclusively as a side effect of the actions in 8.3, never directly.

---

## 9. Schema Amendments Produced During This Step

For cross-reference against `01-data-model.md`, which has been updated to include all of these:

| Addition | Reason | Where specified |
|---|---|---|
| `RefreshToken.user_id` → `ON DELETE CASCADE` | A session has no value once its user is gone — unlike `CohortEnrollment`, there's no history worth preserving | Section 2.8 (here), `01-data-model.md` Section 3 |
| Access token `jti` claim = paired `RefreshToken.id` | Lets logout invalidate an access token immediately, without a separate blocklist table | Section 2.5 (here) |
| Refresh tokens are single-use (rotated, not reusable) | Closes the silent-indefinite-compromise failure mode of reusable tokens | Section 2.6 (here) |
| `Course.created_by_id` (new column) | Content edit permissions needed to be scoped per-instructor; no owner field existed anywhere in the content hierarchy before this | Section 3.4 (here), `01-data-model.md` Section 3 |
| `Course → Chapter → Lesson → Screen` cascade delete + `?confirm=true` API safeguard | Mechanical cascade needed defining; the safeguard compensates for how much content one delete can now remove | Section 7 (here) |
| `Question.created_by_id` (new column, Step 6) | `Question` had no owner at all; any instructor/admin could edit any question regardless of attachment. Edit access ended up broader than ownership (creator OR attached-to-owned-course) — see 3.4 Variant D | `06-threat-model.md`, Instructor actor |
| `AuditLog` (new table, Step 6) | Ownership/role checks cannot defend against a compromised admin by definition; this is the detection-and-recovery mitigation instead | Section 8 (here), `06-threat-model.md`, Compromised Admin actor |

---
