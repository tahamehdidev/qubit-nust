# Qubit — NUST — API Contract

**Status:** Finalized
**Phase:** API Contract Design (Step 2 of pre-implementation design)
**Last updated:** June 2026
**Depends on:** `docs/01-data-model.md` (amended — includes `RefreshToken`, added during this step)

This document is the single source of truth for every endpoint the backend exposes. It should be treated as a contract: frontend code and backend code are both built against this document, not against each other's current behavior. Any endpoint change should be made here first, then reflected in code.

---

## How to Read This Document

- **Section 0** covers account provisioning, operational jobs, the standardized error shape, and the health check — read this alongside Section 1, since the error codes defined here are referenced by every error case in every group below.
- **Section 1** explains two authorization concepts used throughout every group below — read this before the endpoint groups, since most "Who" columns reference it.
- **Sections 2–7** are the six functional groups of endpoints, in the order they were designed.
- **Section 8** is Group 7 — the audit log, added during Step 6 as the mitigation for a compromised-admin actor.
- **Section 9** is Group 8 — admin user management, added in Phase 7C.1 once cohort self-enrollment (Phase 7B.2) made real user volume plausible.
- **Section 10** lists conventions that apply uniformly across all endpoints (error shapes, pagination, naming) so they aren't repeated in every group.
- **Section 11** lists what was deliberately deferred, and why.

---

## 0. Account Provisioning, Operational Jobs, Error Shape, and Health Check

### 0.1 Creating instructor and admin accounts

There is **no API endpoint** for promoting a user to `instructor` or `admin`, and none for creating one directly with an elevated role. This is deliberate, not an oversight — consistent with the principle established in Group 4 (Section 5.1) that the safest version of a sensitive capability is often the one that was never built as an endpoint at all. For a small academic deployment with a handful of instructor accounts, a self-service promotion flow adds attack surface with no real benefit.

**Mechanism:** a command-line script (e.g. `scripts/create-admin.js`), run directly against the database by whoever has server/DB access. It accepts email, name, and role as arguments, hashes the password using the **same** hashing configuration as the signup endpoint (same algorithm, same cost factor — a mismatch here would create an account that can't authenticate through the normal `/auth/login` flow), and inserts the `User` row directly. This script is part of the codebase but is never exposed over HTTP.

### 0.2 RefreshToken cleanup job

`RefreshToken` rows are never deleted on revocation (Section 1.2, Section 2) — but an expired, unused row has no value once enough time has passed, unlike `CohortEnrollment` history, which is kept because it backs the ownership check. Left unbounded, this table grows forever.

**Mechanism:** a scheduled job (daily cron, or an in-process scheduled task for a deployment this size) runs:
```sql
DELETE FROM refresh_token
WHERE expires_at < now() - INTERVAL '30 days';
```
The 30-day grace window past expiry (rather than deleting immediately on expiry) leaves a short buffer for debugging a session-related issue before the row disappears.

### 0.3 Standardized error response shape

Every error case throughout this contract (Sections 2–7) returns the same response shape, so the frontend can parse failures with one shared function rather than per-endpoint logic:

```json
{
  "error": {
    "code": "EMAIL_ALREADY_REGISTERED",
    "message": "An account with this email already exists.",
    "field": "email"
  }
}
```

- `code` — stable, machine-readable, safe to switch on in frontend logic. Does not change even if `message` wording is later edited or translated.
- `message` — human-readable, safe to display directly in the UI.
- `field` — present only when the error relates to one specific input field (lets the frontend highlight that field).

**Error codes used across this contract:**

| Code | Status | Used by |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Generic malformed input (missing field, wrong type) |
| `EMAIL_ALREADY_REGISTERED` | 409 | Signup (Section 2.3) |
| `INVALID_CREDENTIALS` | 401 | Login (Section 2.4) |
| `UNAUTHENTICATED` | 401 | Missing/expired/invalid access token, or revoked/expired refresh token (Section 2.5) |
| `FORBIDDEN` | 403 | Role check or ownership check failed (Section 1) |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `INVALID_ROLE_FOR_ACTION` | 400 | Enrolling a non-learner (Section 6.4), or admin's `instructorId` not an instructor (Section 6.3) |
| `CONTEXT_MISMATCH` | 422 | Question not attached to the given context (Section 5.3) |
| `DUPLICATE_RESOURCE` | 409 | Question already attached (Section 4.5), student already actively enrolled (Section 6.4) |
| `REORDER_SET_MISMATCH` | 400 | Reorder request's ID set doesn't match actual siblings (Section 3.4) |
| `RATE_LIMITED` | 429 | Any rate-limited endpoint, once its limit is exceeded — see `03-security-architecture.md` for the full per-endpoint limit table |
| `INVALID_OR_EXPIRED_TOKEN` | 400 | Password reset confirm with an unknown, already-used, or expired token (Section 2.10) |
| `ACCOUNT_DEACTIVATED` | 403 | Login attempt against a deactivated account (Section 2.4, Section 9.5) |

Every "Errors:" line throughout Sections 2–7 should be read as returning this shape with the corresponding code from this table.

### 0.4 Health check

| Method | Route | Purpose | Who |
|---|---|---|---|
| `GET` | `/health` | Liveness/readiness check for hosting platform and uptime monitoring | Public |

Returns `200 OK` with `{ "status": "ok" }` if the server is running and can reach the database. Returns `503` with `{ "status": "unavailable" }` if the database connection fails. No authentication required — this needs to be reachable by external monitors (and by you, for the cheapest possible "is my server even up" check during development) without a token.

---

## 1. Authorization Patterns

Two distinct kinds of authorization check are used throughout this contract. Confusing them, or re-implementing them inconsistently per-endpoint, is a known source of bugs — so they are named and defined once here, and every endpoint group below refers back to these definitions rather than re-explaining them.

### 1.1 Role check

**Question it answers:** does this user's `role` permit this *type* of action at all?

Answerable from a single column: `User.role`. Same answer for every user with that role, regardless of which specific resource is involved. Implemented as middleware that runs before the controller logic — e.g. "this route requires `admin` or `instructor`."

### 1.2 Ownership check

**Question it answers:** does *this specific* user have a relationship to *this specific* resource that permits the action?

Not answerable from `role` alone — requires querying the data. Two ownership checks are used in this contract:

**Cohort ownership** — does this instructor own this cohort?
```
canInstructorAccessCohort(instructorId, cohortId) → boolean
```
Logic: `Cohort.instructor_id == instructorId` for the given `cohortId`.

**Student ownership (via cohort)** — does this instructor have a teaching relationship with this student?
```
canInstructorAccessUser(instructorId, targetUserId) → boolean
```
Logic: does `targetUserId` have **any** `CohortEnrollment` row — regardless of `status` — in **any** `Cohort` where `instructor_id == instructorId`? Historical (`status = 'removed'`) enrollments count. This is a deliberate choice: an instructor retains access to a student's historical attempt/progress data even after that student is removed from their cohort, since `CohortEnrollment` rows are never deleted (see `01-data-model.md`, Section 2). Defining this check to use only active enrollments would silently undercut the reason that history is preserved in the first place.

### 1.3 Combining the two

Most "instructor, own cohort/student only" rules in this contract are a role check AND an ownership check stacked together: first confirm the caller's role permits the action category, then confirm they specifically own the resource in question. `admin` generally satisfies the role check and is exempt from the ownership check — admins act platform-wide by design.

### 1.4 A related rule: server-derived fields

Distinct from both checks above, but enforced alongside them throughout this contract: **any field that determines ownership, role, or privilege is set by the server from the authenticated session — never trusted from the request body.** This applies to `User.role` at signup, `Cohort.instructor_id` at cohort creation (instructor callers), and any future case with the same shape. This is sometimes called a mass assignment vulnerability when violated — see Section 2.1 and Section 6.1 for the two concrete cases this surfaced.

### 1.5 Role-based field shaping (distinct from both checks above)

A third, separate concern: even once a request is authorized to access an endpoint, the *contents* of the response may need to differ by role. This contract uses it once, deliberately: `Question.content` must never include the correct answer or scoring logic when the caller is a `learner`, but must include it in full for `admin`/`instructor` callers authoring content. See Section 4.4.

---

## 2. Group 1 — Auth & Users

### 2.1 Design notes

- Self-signup always creates a `learner`. The request body for signup has no `role` field — if one is sent, it is ignored, not validated or rejected (rejecting it would confirm to a caller that the field exists and is meaningful, leaking information about the endpoint's internals for no benefit).
- Refresh tokens are delivered via an `httpOnly` cookie, never in a JSON response body, and never readable by client-side JavaScript — see `01-data-model.md` for why this defeats a real XSS-based token theft scenario.
- Refresh tokens are tracked server-side in the `RefreshToken` table (added to the data model during this step) specifically so they can be revoked before natural expiry — supports multiple simultaneous device sessions.
- Login failure always returns one generic message for both "no such email" and "wrong password," to avoid leaking which emails are registered. This is enforced at constant time as well as in message wording — see `03-security-architecture.md` for the timing-safe verification approach (a dummy hash comparison runs even when no matching user exists, so the two cases take equally long).
- `POST /auth/login` is rate-limited both per-IP and per-account (keyed on the normalized, lowercased email). `POST /auth/signup` is rate-limited per-IP only. `POST /auth/logout` / `/auth/logout-all` are rate-limited per-account, to prevent logout-spam against a stolen access token. `POST /auth/refresh` is deliberately unthrottled — the valid-token requirement is considered sufficient; revisit if abuse is observed. Full limits in `03-security-architecture.md`.
- Refresh tokens are single-use: each `/auth/refresh` call atomically revokes the token being used and issues a new one, so reuse of an already-rotated token is detectable and is treated as a compromise signal — see `03-security-architecture.md`.
- The access token includes a `jti` claim, set to its paired `RefreshToken` row's id, so logout can invalidate the access token immediately rather than waiting out its 15-minute natural expiry — see `03-security-architecture.md`.

### 2.2 Endpoints

| Method | Route | Purpose | Who |
|---|---|---|---|
| `POST` | `/auth/signup` | Create account (role always forced to `learner`) | Public |
| `POST` | `/auth/login` | Issue access token + refresh token | Public |
| `POST` | `/auth/refresh` | Issue new access token from valid refresh cookie | Valid refresh cookie |
| `POST` | `/auth/logout` | Revoke this device's refresh token | Logged in |
| `POST` | `/auth/logout-all` | Revoke all of this user's refresh tokens | Logged in |
| `POST` | `/auth/password-reset/request` | Email a password reset link (Phase 7B.1) | Public |
| `POST` | `/auth/password-reset/confirm` | Set a new password using a reset token (Phase 7B.1) | Public |
| `GET` | `/users/me` | Get my own profile | Logged in |
| `PATCH` | `/users/me` | Update my own profile | Logged in |

### 2.3 `POST /auth/signup`

**Request:**
```json
{
  "email": "student@nust.edu.pk",
  "password": "sent over HTTPS only",
  "name": "Ali Raza"
}
```

**Response — `201 Created`:**
```json
{
  "user": {
    "id": "uuid-here",
    "email": "student@nust.edu.pk",
    "name": "Ali Raza",
    "role": "learner"
  }
}
```
`password_hash` is never returned in any response, from any endpoint.

**Errors:** `400` missing/invalid email or password too short · `409` email already registered

### 2.4 `POST /auth/login`

**Request:**
```json
{ "email": "student@nust.edu.pk", "password": "..." }
```

**Response — `200 OK`:**
```json
{
  "user": { "id": "uuid-here", "email": "student@nust.edu.pk", "name": "Ali Raza", "role": "learner" },
  "accessToken": "short-lived JWT — held in memory/React state on the frontend, never localStorage"
}
```
Also sets: `Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict`. Always Strict, in every environment — the deployed frontend proxies `/api/*` to the backend through its own domain (03-security-architecture.md §6.3), so the cookie is first-party even though frontend and backend are hosted separately. Each successful login inserts a new `RefreshToken` row (hash stored, never the raw token).

**Errors:** `400` missing fields · `401` invalid email or password (same message for both cases) · `403` `ACCOUNT_DEACTIVATED` (Phase 7C.1) -- only reachable once the password has already been verified correct, so this doesn't weaken the enumeration-safety of the 401 case above

### 2.5 `POST /auth/refresh`

No request body — reads the `refreshToken` cookie. Looks up the token's hash in `RefreshToken`, checks `revoked_at IS NULL AND expires_at > now()`.

**Response — `200 OK`:** `{ "accessToken": "new short-lived JWT" }`

**Errors:** `401` cookie missing, expired, or token revoked

### 2.6 `POST /auth/logout`

No request body. Finds the `RefreshToken` row matching the current cookie's hash, sets `revoked_at = now()`. Clears the cookie. Other devices' sessions remain valid.

**Response:** `200 OK`

### 2.7 `POST /auth/logout-all`

No request body. Sets `revoked_at = now()` on every `RefreshToken` row for this user where `revoked_at IS NULL`. Clears the cookie on the current device.

**Response:** `200 OK`

### 2.8 `GET /users/me` / `PATCH /users/me`

Standard profile read/update for the logged-in user. `role` is never editable through this endpoint — role changes, if ever needed, are a separate, more privileged action not included in this MVP contract.

### 2.9 `POST /auth/password-reset/request` (Phase 7B.1)

**Request:**
```json
{ "email": "student@nust.edu.pk" }
```

**Response — `200 OK`, always, regardless of whether the email is registered:**
```json
{ "message": "If an account exists for that email, a password reset link has been sent." }
```
Same enumeration-safety discipline as login's identical-message-for-both-cases rule (Section 2.1): a nonexistent email is a silent no-op — no `PasswordResetToken` row created, no email sent, and the response is byte-for-byte identical to the real-account case. Rate-limited per-IP, not per-account, since the caller isn't authenticated and a per-account key could be trivially bypassed by rotating the submitted email — see `03-security-architecture.md`.

When the email is registered: creates a `PasswordResetToken` row (hash stored, 30-minute expiry — same single-use/hashed/expiring shape as `RefreshToken`) and emails a link of the form `{FRONTEND_URL}/reset-password?token=...` via Resend (free tier). In dev/test, with no Resend API key configured, the link is logged to the server console instead of actually sent.

**Errors:** `400` missing/invalid email · `429` rate limited

### 2.10 `POST /auth/password-reset/confirm` (Phase 7B.1)

**Request:**
```json
{ "token": "raw token from the emailed link", "newPassword": "at least 8 characters" }
```

**Response:** `200 OK`, empty body.

Atomically marks the token used (single-use, same pattern as refresh-token rotation), updates `User.password_hash`, and revokes every `RefreshToken` for that user — a password reset logs the account out everywhere, same as `POST /auth/logout-all`.

**Errors:** `400` token missing/unknown/already-used/expired (`INVALID_OR_EXPIRED_TOKEN`) or new password too short (`VALIDATION_ERROR`) · `429` rate limited

---

## 3. Group 2 — Courses, Chapters, Lessons, Screens

> **Amendment (Step 3):** all write endpoints in this group now also require a course-ownership check (Section 1.2), not just a role check — see 3.1. `DELETE` endpoints that cascade to children now require an explicit `?confirm=true` query parameter — see 3.5.

### 3.1 Design notes

- Read access (`GET`) is open to any logged-in user — a learner needs to see content to learn from it.
- Write access (`POST`/`PATCH`/`DELETE`) is granted to `admin` and `instructor` — a deliberate choice so an instructor (e.g. Dr. Hammad) can author content directly without the original developer being a bottleneck. See the project's strategy document, Section 4.1.
- **For `instructor` callers, every write additionally requires course ownership** (Section 1.2's `requireCourseOwnership`): an instructor can only create, update, reorder, or delete content within a `Course` they created (`Course.created_by_id`). `admin` bypasses this check. This applies to creation under a parent, not just updates to existing resources — e.g. `POST /courses/:id/chapters` checks ownership of the *parent* course before allowing a new chapter to be added to it, otherwise one instructor could add content into another instructor's course.
- For chapter/lesson/screen-level routes, ownership is resolved by walking up the hierarchy to the owning `Course` (`Lesson → Chapter → Course`, etc.) before checking `created_by_id` — see `03-security-architecture.md` for the resolver implementation.
- `order_index` is never client-specified. The server computes it as `MAX(order_index) + 1` for the relevant parent, inside the same transaction as the insert — this avoids both a race condition (two simultaneous creates both claiming the same position) and an unnecessary round-trip (client fetching current max before creating).
- Reordering is a separate, dedicated action per level (chapters, lessons, screens), not part of `PATCH`. The client sends the full ordered list of sibling IDs; the server validates that the set exactly matches the actual current siblings before applying anything — partial or mismatched sets are rejected outright (`400`, code `REORDER_SET_MISMATCH`) rather than partially applied, since silently applying a malformed reorder is how ordering data corrupts invisibly.

### 3.2 Endpoints

| Method | Route | Purpose | Who |
|---|---|---|---|
| `GET` | `/courses` | List all courses | Any logged-in user |
| `GET` | `/courses/:id` | Get one course (nested chapters) | Any logged-in user |
| `POST` | `/courses` | Create a course | `admin`, `instructor` |
| `PATCH` | `/courses/:id` | Update a course | `admin`, `instructor` (ownership check) |
| `DELETE` | `/courses/:id?confirm=true` | Delete a course (cascades to chapters/lessons/screens) | `admin`, `instructor` (ownership check) |
| `GET` | `/courses/:id/chapters` | List chapters | Any logged-in user |
| `POST` | `/courses/:id/chapters` | Add a chapter (server sets `order_index`) | `admin`, `instructor` (ownership check on parent course) |
| `PATCH` | `/chapters/:id` | Update a chapter | `admin`, `instructor` (ownership check) |
| `PATCH` | `/courses/:id/chapters/reorder` | Reorder chapters | `admin`, `instructor` (ownership check) |
| `DELETE` | `/chapters/:id?confirm=true` | Delete a chapter (cascades to lessons/screens) | `admin`, `instructor` (ownership check) |
| `GET` | `/chapters/:id/lessons` | List lessons | Any logged-in user |
| `POST` | `/chapters/:id/lessons` | Add a lesson (server sets `order_index`) | `admin`, `instructor` (ownership check on parent course) |
| `GET` | `/lessons/:id` | Get a single lesson (added for the Lesson Player, Frontend Milestone 5 -- there was no way to fetch a lesson's own title standalone without walking back through its parent chapter's list). Response also includes `course_id` (there is no standalone `GET /chapters/:id` to resolve this otherwise) and `next_lesson_id` (the next lesson in reading order -- same chapter, else the next chapter's first lesson, else `null` if this is the course's last lesson) — added for the Lesson Player's "back to course"/"next lesson" navigation (nav-flow audit). | Any logged-in user |
| `PATCH` | `/lessons/:id` | Update a lesson | `admin`, `instructor` (ownership check) |
| `PATCH` | `/chapters/:id/lessons/reorder` | Reorder lessons | `admin`, `instructor` (ownership check) |
| `DELETE` | `/lessons/:id?confirm=true` | Delete a lesson (cascades to screens) | `admin`, `instructor` (ownership check) |
| `GET` | `/lessons/:id/screens` | List screens | Any logged-in user |
| `POST` | `/lessons/:id/screens` | Add a screen (server sets `order_index`) | `admin`, `instructor` (ownership check on parent course) |
| `PATCH` | `/screens/:id` | Update a screen | `admin`, `instructor` (ownership check) |
| `PATCH` | `/lessons/:id/screens/reorder` | Reorder screens | `admin`, `instructor` (ownership check) |
| `DELETE` | `/screens/:id` | Delete a screen (leaf node — no cascade, no `?confirm=true` needed) | `admin`, `instructor` (ownership check) |

### 3.3 Create example — `POST /chapters/:id/lessons`

**Request:** `{ "title": "Superconducting Qubits" }` — no `order_index`.

**Response — `201 Created`:**
```json
{ "lesson": { "id": 14, "chapterId": 3, "title": "Superconducting Qubits", "orderIndex": 5 } }
```

**Errors:** `403 FORBIDDEN` if the caller is an `instructor` who doesn't own the parent course (resolved by walking `chapter → course`)

### 3.4 Reorder example — `PATCH /chapters/:id/lessons/reorder`

**Request:** `{ "orderedIds": [14, 9, 11, 3] }` — full sibling set, new order.

**Validation:** fetch actual current siblings for this parent; the submitted set must be exactly equal (same size, same IDs, no extras, no omissions, none belonging to a different parent).

**Errors:** `400 REORDER_SET_MISMATCH` submitted set doesn't exactly match actual siblings

### 3.5 Cascading delete confirmation

`DELETE /courses/:id`, `DELETE /chapters/:id`, and `DELETE /lessons/:id` all cascade to child content at the database level (Section 2, `01-data-model.md`). Because this is irreversible and can remove a large amount of content in one action, these three routes require an explicit `?confirm=true` query parameter. `DELETE /screens/:id` is exempt — screens are leaf nodes with no children to cascade to.

| Condition | Response |
|---|---|
| `confirm` param absent or not exactly `"true"` | `400 VALIDATION_ERROR` — message states what will be deleted (e.g. chapter/lesson/screen counts) and that `?confirm=true` is required to proceed |
| `confirm=true` present | Proceeds with the cascading delete |

This is a wire-level safety mechanism only — the actual protection against accidental deletion is expected to live in the frontend's confirmation UI (e.g. a dialog requiring the user to type the course name), which is what should be responsible for setting this parameter, not a hardcoded default in frontend API-client code.

---

## 4. Group 3 — Questions, ScreenQuestion, PracticeSet, PracticeSetQuestion

> **Amendment (Step 6):** `PATCH /questions/:id` and `DELETE /questions/:id` now require ownership-equivalent access, not just a role check — see 4.5.

### 4.1 Design notes

- `Question` has no FK to `Screen` or `PracticeSet` (per the data model — questions are reusable). Consequently, **creating** a question and **attaching** it somewhere are two separate actions, unlike Group 2 where create-and-attach were combined.
- `GET /questions` (search/browse) exists specifically to make reuse discoverable during authoring — without it, the M:N design is structurally possible but practically unreachable, and every question would end up duplicated in practice anyway.
- Attaching a question that's already attached to the same screen/practice set returns `409 Conflict`, not a silent no-op — this mirrors the database's own composite primary key on `(screen_id, question_id)` / `(practice_set_id, question_id)`, which is the actual enforcement mechanism; the `409` is the controller translating that constraint violation into a clean response.
- **Editing or deleting a `Question` requires "edit access," not simple ownership** (Section 4.5): the creator, OR any instructor who has attached the question to one of their own courses. This is deliberately broader than `Course`'s ownership model, since a `Question` can be attached across multiple instructors' courses at once — see `06-threat-model.md`, Instructor actor, for the full reasoning and the accepted tradeoff this creates (any instructor relying on a shared question can edit it, which also means any one of them can break it for the others).

### 4.2 Endpoints

| Method | Route | Purpose | Who |
|---|---|---|---|
| `GET` | `/questions` | Search/browse question bank | Any logged-in user |
| `GET` | `/questions/:id` | Get one question | Any logged-in user |
| `POST` | `/questions` | Create a question (unattached) | `admin`, `instructor` |
| `PATCH` | `/questions/:id` | Update a question | `admin`, OR `instructor` with edit access (4.5) |
| `DELETE` | `/questions/:id` | Delete a question (cascades to attachments, no pre-check) | `admin`, OR `instructor` with edit access (4.5) |
| `POST` | `/screens/:id/questions` | Attach an existing question to a screen | `admin`, `instructor` |
| `DELETE` | `/screens/:id/questions/:questionId` | Detach from a screen | `admin`, `instructor` |
| `GET` | `/lessons/:id/practice-sets` | List practice sets for a lesson | Any logged-in user |
| `POST` | `/lessons/:id/practice-sets` | Create a practice set | `admin`, `instructor` |
| `GET` | `/practice-sets/:id` | Get one (with ordered questions) | Any logged-in user |
| `PATCH` | `/practice-sets/:id` | Update | `admin`, `instructor` |
| `DELETE` | `/practice-sets/:id` | Delete | `admin`, `instructor` |
| `POST` | `/practice-sets/:id/questions` | Attach an existing question | `admin`, `instructor` |
| `DELETE` | `/practice-sets/:id/questions/:questionId` | Detach | `admin`, `instructor` |
| `PATCH` | `/practice-sets/:id/questions/reorder` | Reorder (same exact-match rule as Group 2) | `admin`, `instructor` |

### 4.3 `GET /questions` — search/browse

Rate-limited at 30/min per account — the cheapest-to-abuse open read in this contract, reachable by any logged-in role including `learner`. See `03-security-architecture.md`.

```
GET /questions?search=grover&type=mcq&page=1&limit=20
```

**Response — `200 OK`:**
```json
{
  "questions": [
    { "id": 41, "prompt": "What does Grover's algorithm find?", "type": "mcq" },
    { "id": 52, "prompt": "How many oracle calls does Grover need?", "type": "mcq" }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 37 }
}
```
List endpoints are never a bare array — always wrapped with a `pagination` object alongside, so pagination metadata can be added without a breaking change later. This convention applies to every list endpoint in this contract (see Section 10).

### 4.4 Field shaping for `Question.content` (ties to Section 1.5)

`Question.content` holds the prompt's options, the correct answer, and scoring config (per the data model). This field must never be sent to a `learner` caller in full — correct-answer and scoring data are stripped server-side before the response is sent. `admin`/`instructor` callers receive the full content, since they are authoring it.

This applies to every endpoint that returns `Question.content` embedded in a response — most directly `GET /screens/:id` and `GET /practice-sets/:id` (Group 2/3), where a naive implementation would otherwise expose the answer in the network response before the learner has attempted the question.

`Question.hint` and `Question.explanation` follow the same role-shaping function (`toPublicQuestion`) but diverge from each other and from `content`: `hint` is always included, for every role, on every endpoint that returns a `Question` — it's a pre-attempt nudge, not the answer, so there's nothing to strip. `explanation` is excluded entirely for a `learner` caller from every one of those same endpoints; it only ever reaches a learner via `POST /attempts`' response (Section 5.3), after the server has already graded that specific attempt. `admin`/`instructor` callers see `explanation` everywhere, same as `content`.

### 4.5 `Question` edit access (Step 6 amendment)

Editing or deleting a `Question` requires one of:
- The caller is `admin`, or
- The caller is the `Question.created_by_id`, or
- The caller is an `instructor` who has attached this question (via `ScreenQuestion` or `PracticeSetQuestion`) to at least one course they own (`Course.created_by_id`)

This check traverses two different junction-table paths up two different hierarchy depths (`ScreenQuestion → Screen → Lesson → Chapter → Course` and `PracticeSetQuestion → PracticeSet → Lesson → Chapter → Course`), making it the most expensive ownership-equivalent check in this contract. No dedicated rate limit was added for it — the caller pool is the same small, trusted instructor/admin group as every other content-authoring endpoint, and the target is a single named question, not a broad enumerable surface — but it's worth keeping in mind if a database index on the relevant foreign keys is needed once implemented.

**Accepted tradeoff:** this is deliberately broader than simple creator-only ownership. Once a question is shared across instructors, any of them can edit it for their own purposes, which also means any of them can change or break it for the others — including via deletion, which cascades with no pre-check or warning. See `06-threat-model.md`, Instructor actor, for the full reasoning.

**Errors:** `403 FORBIDDEN` if the caller has neither created nor attached the question to an owned course.

### 4.6 Attach example — `POST /screens/:id/questions`

**Request:** `{ "questionId": 41 }`

**Errors:** `404` screen or question doesn't exist · `409` question already attached to this screen

---

## 5. Group 4 — Attempts & Progress

> **Amendment (Step 6):** `userId` on `POST /attempts` is now explicitly stated as server-derived (5.3, was previously only implied by omission); XP is now awarded only on a user's first correct attempt per question (5.3); `GET /attempts`/`GET /progress` now require `courseId` for instructor callers (5.2); `POST /attempts` gained a 60/min per-account backstop rate limit (5.1).
>
> **Amendment (Frontend Milestone 6):** `POST /attempts`'s response now includes a `correctAnswer` field, present only when `isCorrect: false` (5.3). This is a deliberate, narrowly-scoped exception to "the correct answer is never sent to the frontend" (5.1) — made only after the learner's own attempt on that question has already been graded incorrect, to power an opt-in "See answer" action rather than an automatic reveal (keeping the existing unlimited-retry mechanic meaningful). Accepted tradeoff: the field rides in the same response as every other incorrect attempt, so it is visible in the network payload regardless of whether the learner ever clicks "See answer" — this is UI-only gating, not a stronger access control, judged sufficient for an educational app rather than a proctored assessment.

### 5.1 Design notes

- Grading happens entirely server-side. The correct answer is never sent to the frontend before submission — `Question.content`'s answer/scoring fields are stripped for learner-facing responses (Section 4.4), and `is_correct` is computed by the server inside `POST /attempts`, never trusted from the client.
- `Attempt.context_id` is polymorphic (per the data model, no DB-level FK) — the application layer is the only place this reference gets validated, and it does so before the attempt is recorded.
- There is **no write endpoint for `Progress`**, at all. `xp`, `current_streak`, and `level` update only as an internal server-side side effect of a successful `POST /attempts`. This is deliberate: the safest version of a dangerous capability (a learner being able to set their own XP) is the version that was never built, not a version that was built and then carefully locked down.
- "Instructor, own cohort only" routes in this group use the ownership check from Section 1.2, **now additionally scoped by `courseId`** — see 5.2.
- `POST /attempts` carries a 60/min per-account backstop rate limit — revised during threat modeling from the original "no limit" decision. The limit is set deliberately far above plausible human throughput (a fast learner sustaining roughly one attempt every 2–3 seconds tops out around 20–30/min) specifically so it never punishes legitimate use, while still bounding worst-case scripted flooding. `GET /attempts?userId=:id` and `GET /progress?userId=:id` remain rate-limited at 30/min per account, since both run an ownership-check join query before fetching data. See `03-security-architecture.md` for the full rate-limit table.

### 5.2 Endpoints

| Method | Route | Purpose | Who |
|---|---|---|---|
| `POST` | `/attempts` | Submit an answer | Logged in (any role) |
| `GET` | `/attempts?userId=me` | My own attempt history | Logged in (own data only) |
| `GET` | `/attempts?userId=:id&courseId=:id` | Another user's attempts, scoped to one course | `instructor` (ownership check, `courseId` **required**), `admin` (`courseId` optional) |
| `GET` | `/progress?userId=me` | My own progress | Logged in (own data only) |
| `GET` | `/progress?userId=:id&courseId=:id` | A specific user's progress | `instructor` (ownership check), `admin` |

**Why `courseId` became required for instructor callers (Step 6):** the original ownership check only verified "does this instructor have *any* teaching relationship with this user" — a binary check with no course scoping. That meant an instructor connected to a student through one cohort/course could see that student's attempt history across *every* course they're taking, including ones with no connection to the instructor at all. The fix scopes the check to require **both** a teaching relationship (via `CohortEnrollment`) **and** evidence the student has `Progress` in the specifically-requested course — closing the cross-course disclosure without requiring a new `Cohort`-to-`Course` link in the schema. See `06-threat-model.md`, Instructor actor, Information Disclosure.

### 5.3 `POST /attempts`

**Request:**
```json
{
  "questionId": 41,
  "contextType": "screen",
  "contextId": 12,
  "answer": { "selectedOption": "B" }
}
```

Note there is no `userId` field — it is **always derived from the authenticated session**, never accepted from the request body, the same mass-assignment principle applied everywhere else in this contract (Section 1.4 of `03-security-architecture.md`).

**Server-side steps, strictly in order:**
1. Verify `questionId` exists.
2. Verify `contextId` exists in the table named by `contextType` (`screen` → `Screen`; `practice_set` → `PracticeSet`) — the application-layer check this polymorphic design requires, per `01-data-model.md` Section 4.
3. Verify the question is actually attached to that context via the relevant junction table — prevents submitting an answer to a question never shown in that context.
4. Grade server-side; compute `is_correct`.
5. **Before inserting the new row:** check whether an `Attempt` already exists for `(this user, this question)` with `is_correct = true`. This check must run before the insert, or it will always see the row being inserted and never correctly detect "no prior correct attempt."
6. Insert the `Attempt` row — every attempt is recorded regardless of the check above; full history is always preserved.
7. Award XP to `Progress` **only if** `is_correct = true` AND no prior correct attempt existed for this question. Otherwise, `Progress` is left unchanged.

**Why this rule exists (Step 6):** without it, a learner could repeatedly answer the same easy question to inflate `Progress.xp` indefinitely — XP would measure button-clicks, not learning. The rule still rewards eventually getting a question right after earlier wrong attempts (XP is awarded on the *first correct* attempt, not only a first-attempt-ever success), which matches the platform's attempt-and-feedback pedagogical model rather than only rewarding first-try success. See `06-threat-model.md`, Learner actor, Tampering.

**Response — `201 Created`:**
```json
{ "attempt": { "id": 501, "questionId": 41, "isCorrect": true, "xpAwarded": true, "attemptedAt": "2026-06-25T18:02:00Z", "explanation": "..." } }
```
```json
{ "attempt": { "id": 502, "questionId": 41, "isCorrect": false, "xpAwarded": false, "attemptedAt": "2026-06-25T18:03:00Z", "correctAnswer": { "selectedOptionIndex": 1 }, "explanation": "..." } }
```
`xpAwarded` lets the frontend distinguish "correct, and you earned XP" from "correct, but you already had credit for this one" — both are `isCorrect: true`, but the UI should likely present them differently (e.g. no XP-gain animation on a repeat correct answer).

`correctAnswer` is present only when `isCorrect: false`, shaped identically to the `answer` object the frontend submits for that question `type` (`{ selectedOptionIndex }` / `{ order }` / `{ value }`) — see the Frontend Milestone 6 amendment above.

`explanation` is present on **every** response regardless of `isCorrect` (`null` if the question was never authored with one) — see Section 4.4. Unlike `correctAnswer`, it's worth reading on a correct answer too, not just a wrong one.

**Errors:** `400` malformed answer shape for the question's `type` · `404` `questionId`/`contextId` doesn't exist · `422` question exists but isn't attached to the given context

---

## 6. Group 5 — Cohorts & Enrollment

### 6.1 Design notes

- `Cohort.instructor_id` is server-derived, never trusted from the request body, for an `instructor` caller — the same mass-assignment principle as signup's `role` field (Section 1.4). For an `instructor`, an `instructorId` field in the body is silently ignored, not rejected with an error (consistent with Section 2.1's reasoning).
- `admin` callers are the one exception: they may explicitly set `instructorId` to create a cohort on another instructor's behalf. This is a deliberate, explicit carve-out, not a relaxation of the general rule.
- Removing a student from a cohort is `PATCH`, not `DELETE` — the underlying `CohortEnrollment` row is never deleted, only marked `status = 'removed'` (per the data model). A `DELETE` route name would misdescribe what actually happens to the data.
- Enrollment requests are rejected with `400` if the target user doesn't have `role = 'learner'` — this keeps `CohortEnrollment`'s meaning reliable for every downstream consumer (including the ownership check in Section 1.2), which otherwise would have to re-verify the target's role itself.
- `POST /cohorts/:id/students` is rate-limited (20/min per account) — partly abuse prevention, partly because its response (role-mismatch vs. duplicate-enrollment vs. success) could otherwise be used to enumerate which UUIDs belong to real `learner` accounts. `POST /cohorts` with an admin-supplied `instructorId` has its own tighter limit (10/min per admin) — see `03-security-architecture.md`.
- **Phase 7B.2**: every `Cohort` also carries a server-generated `joinCode` — an 8-character, human-typeable code a `learner` can self-enroll with, instead of an instructor adding students one by one by UUID. It's always server-generated (never caller-chosen) and can be revoked/replaced via `PATCH /cohorts/:id { regenerateJoinCode: true }`. Bulk CSV import (`POST /cohorts/:id/students/bulk`) is a secondary import path for instructors working from an official roster; self-enrollment via join code is the primary onboarding path.

### 6.2 Endpoints

| Method | Route | Purpose | Who |
|---|---|---|---|
| `GET` | `/cohorts/:id` | Get cohort details | `instructor` (ownership check), `admin` |
| `GET` | `/cohorts?instructorId=me` | List my own cohorts | `instructor` |
| `POST` | `/cohorts` | Create a cohort | `instructor`, `admin` |
| `PATCH` | `/cohorts/:id` | Update a cohort, or regenerate its join code | `instructor` (ownership check), `admin` |
| `DELETE` | `/cohorts/:id` | Delete a cohort | `instructor` (ownership check), `admin` |
| `GET` | `/cohorts/:id/students` | List enrolled students | `instructor` (ownership check), `admin` |
| `POST` | `/cohorts/:id/students` | Enroll a student | `instructor` (ownership check), `admin` |
| `POST` | `/cohorts/:id/students/bulk` | Enroll students by email, per-row results (Phase 7B.2) | `instructor` (ownership check), `admin` |
| `PATCH` | `/cohorts/:id/students/:userId` | Remove a student (`status = 'removed'`) | `instructor` (ownership check), `admin` |
| `POST` | `/cohorts/join` | Self-enroll via join code (Phase 7B.2) | `learner` |

### 6.3 `POST /cohorts`

**Request:**
```json
{ "name": "Quantum Workshop Cohort — June 2026", "instructorId": "optional — admin only" }
```

**Server-side branching:**
```
if caller.role == 'instructor':
    instructor_id = caller.id   # instructorId in body, if present, is ignored
if caller.role == 'admin':
    instructor_id = body.instructorId if present else caller.id
    # if present, must reference a real User with role = 'instructor'
```

**Response — `201 Created`:**
```json
{ "cohort": { "id": 7, "name": "Quantum Workshop Cohort — June 2026", "instructorId": "uuid", "createdAt": "2026-06-25T18:10:00Z" } }
```

**Errors:** `400` (admin only) `instructorId` doesn't reference a real user with `role = 'instructor'`

### 6.4 `POST /cohorts/:id/students`

**Request:** `{ "userId": "uuid-of-student" }`

**Server-side validation order:**
1. Caller owns this cohort (ownership check) or is `admin`.
2. `userId` exists.
3. That user has `role = 'learner'` — else `400`.
4. No existing **active** enrollment for this pair (enforced at the DB level by the partial unique index from `01-data-model.md`; the controller catches the violation and returns a clean error rather than letting a raw DB error surface).

**Errors:** `400` `userId` doesn't exist or isn't a `learner` · `403` instructor doesn't own this cohort · `409` student already has an active enrollment in this cohort

### 6.5 `POST /cohorts/join` (Phase 7B.2)

**Request:** `{ "joinCode": "ABC123DE" }` (case-insensitive; matched against the cohort's stored code after trimming/uppercasing)

Resolves the cohort by its `joinCode`, then enrolls the calling `learner` — never a `userId` in the body, since a learner can only ever join themselves this way. Reuses the exact same enrollment logic as `POST /cohorts/:id/students` (same duplicate-enrollment handling, same `CohortEnrollment` row shape), just entered via a code instead of an instructor picking a UUID.

**Response — `201 Created`:** `{ "enrollment": { ... }, "cohort": { "id": 7, "name": "..." } }`

**Errors:** `403` caller isn't a `learner` · `404` no cohort matches this code (also returned for a code that was valid but has since been regenerated) · `409` already actively enrolled in this cohort · `429` rate limited (10/15min per account — a backstop against guessing the code, on top of its own entropy; see `03-security-architecture.md`)

### 6.6 `POST /cohorts/:id/students/bulk` (Phase 7B.2)

**Request:** `{ "emails": ["a@nust.edu.pk", "b@nust.edu.pk", ...] }` (max 500 per request)

Resolves each email to a user and enrolls it, independently — one bad row (no account, wrong role, already enrolled) never aborts the rest of the batch. Sequential, not parallel (bulk CSV import isn't a hot path).

**Response — `200 OK`:**
```json
{
  "results": [
    { "email": "a@nust.edu.pk", "status": "enrolled" },
    { "email": "b@nust.edu.pk", "status": "failed", "reason": "No account found for this email." }
  ]
}
```

**Errors:** `403` instructor doesn't own this cohort · `400` malformed/empty `emails` array

---

## 7. Group 6 — Instructor Dashboard / Analytics

### 7.1 Design notes

- Every endpoint in this group is **read-only and aggregated** — nothing here creates or modifies data, it summarizes data Groups 4–5 already produced. RBAC is the same ownership check as Group 5; the design complexity here is in what gets aggregated, not access control.
- Two of the three analytics views originally scoped (per the project's strategy document) were deliberately narrowed or deferred — see 7.4 and Section 11.

### 7.2 Endpoints

| Method | Route | Purpose | Who |
|---|---|---|---|
| `GET` | `/cohorts/:id/dashboard/completion` | Per-course completion stats for a cohort | `instructor` (ownership check), `admin` |
| `GET` | `/cohorts/:id/dashboard/lesson-pacing` | Approximate inter-question timing per lesson | `instructor` (ownership check), `admin` |

### 7.3 `GET /cohorts/:id/dashboard/completion`

Computed from `Progress` rows joined against `CohortEnrollment` for the given cohort — no schema beyond what `01-data-model.md` already defines.

**Response:**
```json
{
  "courseId": 2,
  "courseTitle": "Quantum Algorithms",
  "totalStudents": 24,
  "completed": 9,
  "inProgress": 13,
  "notStarted": 2,
  "averageXp": 340
}
```

### 7.4 `GET /cohorts/:id/dashboard/lesson-pacing`

Approximates "time on lesson" from gaps between consecutive `Attempt.attempted_at` timestamps within the same lesson — the closest available proxy given the current data model, which has no explicit "lesson started" event. This is scoped honestly: it measures **inter-question time only**, and is blind to time spent on a lesson's first screen before any question is answered, and to screens with no embedded question at all (pure explanation screens never produce an `Attempt`).

**Response:**
```json
{
  "lessonId": 14,
  "lessonTitle": "Superconducting Qubits",
  "averageInterQuestionSeconds": 142,
  "sampleSize": 18,
  "note": "Approximate — measures time between consecutive question attempts only. Does not capture time on screens without questions, or time before the first question in a lesson."
}
```
The `note` field is returned in the response itself, not just documented here — so any dashboard UI built against this endpoint is structurally nudged toward displaying the caveat rather than presenting the number as more precise than it is.

---

## 8. Group 7 — Audit Log (Step 6 addition)

### 8.1 Design notes

- Added during threat modeling as the mitigation for the compromised/malicious-admin actor — ownership and role checks cannot defend against this actor by definition, since the attacker already holds the role those checks verify. This endpoint exists so the resulting damage is at least traceable and reviewable after the fact. See `06-threat-model.md`, Compromised Admin actor.
- This is a **detection-and-recovery** control, not a prevention control. It does not stop a malicious admin action; it makes that action visible afterward.
- Read-only, `admin` only. There is no write access to `AuditLog` via the API at all — entries are created exclusively as a side effect of the specific actions listed in `01-data-model.md`'s `AuditLog` spec, never directly.

### 8.2 Endpoints

| Method | Route | Purpose | Who |
|---|---|---|---|
| `GET` | `/audit-log` | List audit log entries, filterable | `admin` |

### 8.3 `GET /audit-log`

```
GET /audit-log?resourceType=Course&userId=:id&since=2026-06-01&page=1&limit=20
```

All query parameters optional; combinable.

**Response — `200 OK`:**
```json
{
  "entries": [
    {
      "id": 891,
      "userId": "uuid-of-admin",
      "action": "course.deleted",
      "resourceType": "Course",
      "resourceId": "14",
      "metadata": { "cascadedChapters": 4, "cascadedLessons": 12 },
      "createdAt": "2026-06-20T09:14:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 6 }
}
```

---

## 9. Group 8 — Admin User Management (Phase 7C.1)

### 9.1 Design notes

- Deferred at MVP (originally listed in Section 11 below as "Admin user listing/management endpoints... kept the auth surface area smaller") — revisited once Phase 7B.2's self-enrollment could plausibly create real user volume quickly, at which point an admin having no way to search accounts or handle a problem account became a real gap, not a hypothetical one.
- Deactivation is a soft-delete (`User.deactivated_at`), mirroring `CohortEnrollment.status='removed'`'s existing "mark, don't delete" convention — history (attempts, progress, audit-log entries) stays intact. There is no reactivation endpoint; treat deactivation as effectively final for this pass.
- Deactivating a user immediately revokes every `RefreshToken` for that account (logged out everywhere, same mechanism as `POST /auth/logout-all`) and blocks all future logins (`403 ACCOUNT_DEACTIVATED`) — both are real, not just "the account looks disabled in a list somewhere."
- `POST /admin/users` creates an **instructor** account only — the request has no `role` field to set otherwise. Admin account creation stays a CLI-only action (`scripts/create-admin.js`), a deliberately smaller blast radius for the one action that grants platform-wide access.

### 9.2 Endpoints

| Method | Route | Purpose | Who |
|---|---|---|---|
| `GET` | `/admin/users` | Search/filter/paginate all accounts | `admin` |
| `POST` | `/admin/users` | Create an instructor account | `admin` |
| `PATCH` | `/admin/users/:userId/deactivate` | Deactivate an account | `admin` |

### 9.3 `GET /admin/users`

```
GET /admin/users?search=ada&role=learner&page=1&limit=20
```

All query parameters optional; `search` matches name or email as a case-insensitive substring.

**Response — `200 OK`:**
```json
{
  "users": [
    { "id": "uuid", "email": "ada@nust.edu.pk", "name": "Ada Lovelace", "role": "learner", "deactivatedAt": null }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1 }
}
```

### 9.4 `POST /admin/users`

**Request:** `{ "email": "new.instructor@nust.edu.pk", "name": "New Instructor" }`

**Response — `201 Created`:**
```json
{
  "user": { "id": "uuid", "email": "new.instructor@nust.edu.pk", "name": "New Instructor", "role": "instructor", "deactivatedAt": null },
  "generatedPassword": "shown once -- share it with them out-of-band, never retrievable again"
}
```

**Errors:** `409` email already registered

### 9.5 `PATCH /admin/users/:userId/deactivate`

No request body. Idempotent — a second call against an already-deactivated account succeeds and keeps the original `deactivatedAt` timestamp, rather than erroring or bumping it.

**Response — `200 OK`:** `{ "user": { ..., "deactivatedAt": "2026-08-09T12:00:00Z" } }`

**Errors:** `404` no such user

---

## 10. Cross-Cutting Conventions

These apply uniformly across every endpoint in this contract, rather than being repeated per group.

| Convention | Rule |
|---|---|
| List endpoint responses | Never a bare array — always `{ "<resource>": [...], "pagination": {...} }` |
| Sensitive fields | `password_hash` and raw refresh tokens are never returned in any response body, ever |
| Server-derived fields | Any field determining role, ownership, or privilege (`role` at signup, `instructor_id` at cohort creation) is set from the authenticated session, never trusted from the request body — see Section 1.4 |
| Ambiguous auth failures | Login failure uses one generic message for both "no such user" and "wrong password" — never reveal which |
| Validation vs. semantic errors | `400` = malformed/invalid input shape. `422` = input is well-formed but semantically invalid given existing state (e.g. a question not attached to the context it's being answered through) |
| Error response shape | Every error response uses the `{ "error": { "code", "message", "field" } }` shape and one of the codes defined in Section 0.3 — never an ad hoc per-endpoint shape |
| Mutating a "removed" state | Use `PATCH` with a status field, never `DELETE`, for any resource where history must be preserved (`CohortEnrollment`) |
| Reorder operations | Client sends the full ordered sibling-ID list; server validates an exact match against actual current siblings before applying anything — partial/mismatched sets are rejected with `400`, never partially applied |

---

## 11. Deferred — Flagged for a Later Design Pass

Documented here so they are not forgotten, and so it's clear they were a deliberate scope decision made during this step, not an oversight.

- **Common wrong-answer breakdown per question.** Requires aggregating over `Attempt.answer` (JSONB) content, grouped by actual value — a different query technique than anything else in this contract, and one that needs its own design pass on how answers get normalized for grouping across different question types before it can be specified properly.
- **True time-on-lesson tracking.** The current data model has no event capturing when a learner starts a lesson or screen. The inter-question approximation in Section 7.4 is a stopgap; a proper implementation would need a new schema element (e.g. a `LessonView` table recording start/end timestamps) — a data model change, to be designed in a future pass rather than rushed into this contract.
- ~~Admin user listing/management endpoints~~ — implemented in Phase 7C.1 (Section 9 above).
- **Account reactivation.** Phase 7C.1 shipped deactivation only, deliberately — treat it as effectively final for now. Add a reactivation endpoint if a real need for it shows up.

---