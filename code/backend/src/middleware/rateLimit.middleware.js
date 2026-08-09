import rateLimit from "express-rate-limit";
import { RateLimitedError } from "../errors/index.js";
import { normalizeEmail } from "../utils/normalizeEmail.js";

// Standardized error shape instead of express-rate-limit's default plain-text response
// (02-api-contract.md §0.3) -- every limiter below uses this same handler.
function rateLimitHandler(req, res, next) {
  next(new RateLimitedError());
}

// 03-security-architecture.md §4.2 full limit table -- exported as plain data so it's directly
// unit-testable (tests/unit/rateLimit.test.js) without needing to trigger 429s through
// express-rate-limit's internals to prove the configured values are correct.
export const RATE_LIMITS = {
  signupPerIp: { windowMs: 60 * 60 * 1000, limit: 5 },
  loginPerIp: { windowMs: 15 * 60 * 1000, limit: 20 },
  loginPerAccount: { windowMs: 15 * 60 * 1000, limit: 5 },
  logoutPerAccount: { windowMs: 60 * 1000, limit: 10 },
  questionSearchPerAccount: { windowMs: 60 * 1000, limit: 30 },
  attemptSubmitPerAccount: { windowMs: 60 * 1000, limit: 60 },
  studentDataPerAccount: { windowMs: 60 * 1000, limit: 30 },
  cohortEnrollPerAccount: { windowMs: 60 * 1000, limit: 20 },
  cohortAdminReassignPerAdmin: { windowMs: 60 * 1000, limit: 10 },
  passwordResetRequestPerIp: { windowMs: 60 * 60 * 1000, limit: 5 },
  passwordResetConfirmPerIp: { windowMs: 15 * 60 * 1000, limit: 10 },
  cohortJoinPerAccount: { windowMs: 15 * 60 * 1000, limit: 10 },
  changePasswordPerAccount: { windowMs: 15 * 60 * 1000, limit: 5 },
};

// Disabled only when BOTH NODE_ENV=test AND RATE_LIMIT_TEST_MODE=1 are set (tests/preload.js) --
// the integration suite calls signup/login far more than 5-20 times per run across its test
// cases, and would otherwise trip these limits itself long before any test intentionally
// exercises them. Requiring two independent flags means a single misconfigured NODE_ENV can
// never silently disable rate limiting in a real deployment. The *configured* values above are
// unchanged and are what ships to production and what tests/unit/rateLimit.test.js checks
// against the docs; only whether they're enforced changes here, and only for the test process.
const rateLimitingDisabled =
  process.env.NODE_ENV === "test" && process.env.RATE_LIMIT_TEST_MODE === "1";
const effectiveLimit = (limit) => (rateLimitingDisabled ? Number.MAX_SAFE_INTEGER : limit);

export const signupIpLimiter = rateLimit({
  windowMs: RATE_LIMITS.signupPerIp.windowMs,
  limit: effectiveLimit(RATE_LIMITS.signupPerIp.limit),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Per-IP catches one script spraying attempts across many accounts.
export const loginIpLimiter = rateLimit({
  windowMs: RATE_LIMITS.loginPerIp.windowMs,
  limit: effectiveLimit(RATE_LIMITS.loginPerIp.limit),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Per-account (keyed on normalized email) catches distributed credential stuffing across many
// IPs against one account -- stacked alongside loginIpLimiter, not a replacement for it.
export const loginAccountLimiter = rateLimit({
  windowMs: RATE_LIMITS.loginPerAccount.windowMs,
  limit: effectiveLimit(RATE_LIMITS.loginPerAccount.limit),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => normalizeEmail(req.body?.email ?? ""),
  handler: rateLimitHandler,
});

// Prevents logout-spam abuse of a stolen but still-valid access token. Keyed on the authenticated
// user's id -- global JWT verification (auth.middleware.js) always runs before route-specific
// rate limiters, so req.user is already populated here.
export const logoutAccountLimiter = rateLimit({
  windowMs: RATE_LIMITS.logoutPerAccount.windowMs,
  limit: effectiveLimit(RATE_LIMITS.logoutPerAccount.limit),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  handler: rateLimitHandler,
});

// The cheapest-to-abuse open read reachable by any logged-in role including learner
// (03-security-architecture.md §4.2).
export const questionSearchLimiter = rateLimit({
  windowMs: RATE_LIMITS.questionSearchPerAccount.windowMs,
  limit: effectiveLimit(RATE_LIMITS.questionSearchPerAccount.limit),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  handler: rateLimitHandler,
});

// A backstop, not a throughput limit for real use -- set deliberately far above plausible human
// throughput (02-api-contract.md §5.1: a fast learner tops out around 20-30/min) so it never
// punishes legitimate use, while still bounding worst-case scripted flooding.
export const attemptSubmitLimiter = rateLimit({
  windowMs: RATE_LIMITS.attemptSubmitPerAccount.windowMs,
  limit: effectiveLimit(RATE_LIMITS.attemptSubmitPerAccount.limit),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  handler: rateLimitHandler,
});

// GET /attempts?userId=:id and GET /progress?userId=:id both run an ownership-check join query
// before fetching data (02-api-contract.md §5.1) -- same tier as questionSearchLimiter.
export const studentDataLimiter = rateLimit({
  windowMs: RATE_LIMITS.studentDataPerAccount.windowMs,
  limit: effectiveLimit(RATE_LIMITS.studentDataPerAccount.limit),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  handler: rateLimitHandler,
});

// Reduces the risk of using role-mismatch/duplicate-enrollment responses to enumerate real
// learner UUIDs (02-api-contract.md §6.1).
export const cohortEnrollLimiter = rateLimit({
  windowMs: RATE_LIMITS.cohortEnrollPerAccount.windowMs,
  limit: effectiveLimit(RATE_LIMITS.cohortEnrollPerAccount.limit),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  handler: rateLimitHandler,
});

// Only applies to the one action in the contract that assigns Cohort ownership to a different
// user -- an admin's POST /cohorts with instructorId set (02-api-contract.md §6.1). Every other
// POST /cohorts call (instructor, or admin without instructorId) is an ordinary content-authoring
// write and stays unthrottled, same as Groups 2-3 (03-security-architecture.md §4.2).
export const cohortAdminReassignLimiter = rateLimit({
  windowMs: RATE_LIMITS.cohortAdminReassignPerAdmin.windowMs,
  limit: effectiveLimit(RATE_LIMITS.cohortAdminReassignPerAdmin.limit),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  skip: (req) => !(req.user?.role === "admin" && req.body?.instructorId),
  handler: rateLimitHandler,
});

// Per-IP (there's no account to key on -- the request is unauthenticated by definition, and
// keying on the submitted email would let an attacker fan requests out across many emails to
// dodge a per-account limit entirely). Keeps someone from using this endpoint to mass-spam
// arbitrary inboxes with reset links.
export const passwordResetRequestLimiter = rateLimit({
  windowMs: RATE_LIMITS.passwordResetRequestPerIp.windowMs,
  limit: effectiveLimit(RATE_LIMITS.passwordResetRequestPerIp.limit),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Also per-IP, same reasoning -- bounds worst-case scripted guessing against the token's
// high-entropy random value (32 bytes, same generator as refresh tokens), which is already the
// primary defense; this is just a backstop.
export const passwordResetConfirmLimiter = rateLimit({
  windowMs: RATE_LIMITS.passwordResetConfirmPerIp.windowMs,
  limit: effectiveLimit(RATE_LIMITS.passwordResetConfirmPerIp.limit),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Per-account (the caller is authenticated, unlike password reset) -- a backstop against
// scripted guessing of the 8-character join code, on top of the code's own entropy.
export const cohortJoinLimiter = rateLimit({
  windowMs: RATE_LIMITS.cohortJoinPerAccount.windowMs,
  limit: effectiveLimit(RATE_LIMITS.cohortJoinPerAccount.limit),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  handler: rateLimitHandler,
});

// Same tier as loginAccountLimiter -- currentPassword is checked the same way a login password
// is, so it deserves the same brute-force backstop even though the caller is already
// authenticated (Phase 8D).
export const changePasswordLimiter = rateLimit({
  windowMs: RATE_LIMITS.changePasswordPerAccount.windowMs,
  limit: effectiveLimit(RATE_LIMITS.changePasswordPerAccount.limit),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  handler: rateLimitHandler,
});
