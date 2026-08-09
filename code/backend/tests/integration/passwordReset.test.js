import { test, before, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { initDummyHash } from "../../src/utils/hash.js";
import { resetDb, closeTestDb } from "../setup.js";

const SIGNUP_BODY = { email: "learner@example.com", password: "password123", name: "Learner One" };

before(async () => {
  await initDummyHash();
});

beforeEach(async () => {
  await resetDb();
});

after(async () => {
  await pool.end();
  await closeTestDb();
});

// RESEND_API_KEY is unset under NODE_ENV=test, so utils/email.js logs the reset link to the
// console instead of calling a real provider (same no-op discipline as utils/sentry.js). Spying
// on console.log is how these tests recover the raw token that's otherwise never persisted
// anywhere in plaintext (only its hash is stored, same as refresh_token).
async function requestResetAndGetToken(email) {
  const logSpy = mock.method(console, "log", () => {});
  const res = await request(app).post("/auth/password-reset/request").send({ email });
  logSpy.mock.restore();

  const logged = logSpy.mock.calls.map((call) => call.arguments.join(" ")).join("\n");
  const match = logged.match(/token=([a-f0-9]+)/);
  return { res, token: match?.[1] ?? null };
}

test("POST /auth/password-reset/request responds identically for a real and a nonexistent email", async () => {
  await request(app).post("/auth/signup").send(SIGNUP_BODY);

  const realRes = await request(app)
    .post("/auth/password-reset/request")
    .send({ email: SIGNUP_BODY.email });
  const fakeRes = await request(app)
    .post("/auth/password-reset/request")
    .send({ email: "nobody-registered@example.com" });

  assert.equal(realRes.status, 200);
  assert.equal(fakeRes.status, 200);
  assert.deepEqual(realRes.body, fakeRes.body);
});

test("POST /auth/password-reset/request only actually emails a token for a real account", async () => {
  await request(app).post("/auth/signup").send(SIGNUP_BODY);

  const real = await requestResetAndGetToken(SIGNUP_BODY.email);
  assert.ok(real.token, "expected a token to be logged for a real account");

  const fake = await requestResetAndGetToken("nobody-registered@example.com");
  assert.equal(fake.token, null);
});

test("full flow: request -> confirm with the token -> login with the new password", async () => {
  await request(app).post("/auth/signup").send(SIGNUP_BODY);
  const { token } = await requestResetAndGetToken(SIGNUP_BODY.email);

  const confirmRes = await request(app)
    .post("/auth/password-reset/confirm")
    .send({ token, newPassword: "brand-new-password" });
  assert.equal(confirmRes.status, 200);

  const oldPasswordLogin = await request(app)
    .post("/auth/login")
    .send({ email: SIGNUP_BODY.email, password: SIGNUP_BODY.password });
  assert.equal(oldPasswordLogin.status, 401);

  const newPasswordLogin = await request(app)
    .post("/auth/login")
    .send({ email: SIGNUP_BODY.email, password: "brand-new-password" });
  assert.equal(newPasswordLogin.status, 200);
});

test("confirming a password reset revokes every existing session for that user", async () => {
  await request(app).post("/auth/signup").send(SIGNUP_BODY);
  const loginRes = await request(app)
    .post("/auth/login")
    .send({ email: SIGNUP_BODY.email, password: SIGNUP_BODY.password });

  const { token } = await requestResetAndGetToken(SIGNUP_BODY.email);
  await request(app)
    .post("/auth/password-reset/confirm")
    .send({ token, newPassword: "brand-new-password" });

  const meRes = await request(app)
    .get("/users/me")
    .set("Authorization", `Bearer ${loginRes.body.accessToken}`);
  assert.equal(meRes.status, 401);
});

test("POST /auth/password-reset/confirm rejects an unknown token with 400 INVALID_OR_EXPIRED_TOKEN", async () => {
  const res = await request(app)
    .post("/auth/password-reset/confirm")
    .send({ token: "not-a-real-token", newPassword: "brand-new-password" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "INVALID_OR_EXPIRED_TOKEN");
});

test("a used token cannot be reused for a second confirm", async () => {
  await request(app).post("/auth/signup").send(SIGNUP_BODY);
  const { token } = await requestResetAndGetToken(SIGNUP_BODY.email);

  const first = await request(app)
    .post("/auth/password-reset/confirm")
    .send({ token, newPassword: "brand-new-password" });
  assert.equal(first.status, 200);

  const second = await request(app)
    .post("/auth/password-reset/confirm")
    .send({ token, newPassword: "yet-another-password" });
  assert.equal(second.status, 400);
  assert.equal(second.body.error.code, "INVALID_OR_EXPIRED_TOKEN");
});

test("POST /auth/password-reset/confirm rejects a too-short new password with 400 VALIDATION_ERROR", async () => {
  const res = await request(app)
    .post("/auth/password-reset/confirm")
    .send({ token: "whatever", newPassword: "short" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});
