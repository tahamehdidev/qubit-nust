import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";
import { RATE_LIMITS } from "../../src/middleware/rateLimit.middleware.js";

// Configured values match 03-security-architecture.md §4.2's table exactly -- this is what
// actually ships to production; the exported middleware separately scales these up under
// NODE_ENV=test so the integration suite's own repeated requests don't trip them (see
// rateLimit.middleware.js's `effectiveLimit`), which is why this test checks the raw config
// object rather than triggering real 429s against the app-wide limiter instances.
test("configured limits match the documented table", () => {
  assert.deepEqual(RATE_LIMITS.signupPerIp, { windowMs: 60 * 60 * 1000, limit: 5 });
  assert.deepEqual(RATE_LIMITS.loginPerIp, { windowMs: 15 * 60 * 1000, limit: 20 });
  assert.deepEqual(RATE_LIMITS.loginPerAccount, { windowMs: 15 * 60 * 1000, limit: 5 });
  assert.deepEqual(RATE_LIMITS.logoutPerAccount, { windowMs: 60 * 1000, limit: 10 });
  assert.deepEqual(RATE_LIMITS.passwordResetRequestPerIp, { windowMs: 60 * 60 * 1000, limit: 5 });
  assert.deepEqual(RATE_LIMITS.passwordResetConfirmPerIp, { windowMs: 15 * 60 * 1000, limit: 10 });
});

// A real 429-triggering test, but against a throwaway limiter instance built directly from the
// production RATE_LIMITS values (not the app-wide, test-relaxed exported ones) mounted on a
// minimal standalone Express app -- isolated from the rest of the suite, so it can't leak state
// into or be affected by the main integration test file's own request volume.
test("account-keyed limiter returns 429 once its configured limit is exceeded", async () => {
  const app = express();
  app.use(express.json());
  const limiter = rateLimit({
    windowMs: RATE_LIMITS.loginPerAccount.windowMs,
    limit: RATE_LIMITS.loginPerAccount.limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.body?.email ?? "",
    handler: (req, res) => res.status(429).json({ error: { code: "RATE_LIMITED" } }),
  });
  app.post("/probe", limiter, (req, res) => res.status(200).json({ ok: true }));

  const limit = RATE_LIMITS.loginPerAccount.limit;
  for (let i = 0; i < limit; i++) {
    const res = await request(app).post("/probe").send({ email: "same@account.com" });
    assert.equal(res.status, 200, `request ${i + 1} should still be within the limit`);
  }
  const overLimitRes = await request(app).post("/probe").send({ email: "same@account.com" });
  assert.equal(overLimitRes.status, 429);

  // A different key (account) is unaffected by the first account's limit.
  const otherAccountRes = await request(app).post("/probe").send({ email: "other@account.com" });
  assert.equal(otherAccountRes.status, 200);
});
