import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { initDummyHash } from "../../src/utils/hash.js";
import { resetDb, closeTestDb } from "../setup.js";

const SIGNUP_BODY = { email: "learner@example.com", password: "password123", name: "Learner One" };

before(async () => {
  // Integration tests import src/app.js directly, never src/index.js -- so the dummy-hash
  // precomputation that normally happens at server boot (03-security-architecture.md §1.3) must
  // be done explicitly here, or authService.login() throws the first time it hits a nonexistent
  // email.
  await initDummyHash();
});

beforeEach(async () => {
  await resetDb();
});

after(async () => {
  await pool.end();
  await closeTestDb();
});

async function signupAndLogin(overrides = {}) {
  const body = { ...SIGNUP_BODY, ...overrides };
  await request(app).post("/auth/signup").send(body);
  const res = await request(app)
    .post("/auth/login")
    .send({ email: body.email, password: body.password });
  return res;
}

test("POST /auth/signup creates a learner account and never returns password_hash", async () => {
  const res = await request(app).post("/auth/signup").send(SIGNUP_BODY);
  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, SIGNUP_BODY.email);
  assert.equal(res.body.user.role, "learner");
  assert.equal(res.body.user.password_hash, undefined);
  assert.equal(res.body.user.passwordHash, undefined);
});

test("POST /auth/signup ignores a role field in the request body rather than honoring it", async () => {
  const res = await request(app)
    .post("/auth/signup")
    .send({ ...SIGNUP_BODY, role: "admin" });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, "learner");
});

test("POST /auth/signup returns 409 EMAIL_ALREADY_REGISTERED for a duplicate email", async () => {
  await request(app).post("/auth/signup").send(SIGNUP_BODY);
  const res = await request(app).post("/auth/signup").send(SIGNUP_BODY);
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, "EMAIL_ALREADY_REGISTERED");
});

test("POST /auth/signup rejects a too-short password with 400 VALIDATION_ERROR", async () => {
  const res = await request(app)
    .post("/auth/signup")
    .send({ ...SIGNUP_BODY, password: "short" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("POST /auth/login succeeds and sets an httpOnly refreshToken cookie", async () => {
  await request(app).post("/auth/signup").send(SIGNUP_BODY);
  const res = await request(app)
    .post("/auth/login")
    .send({ email: SIGNUP_BODY.email, password: SIGNUP_BODY.password });

  assert.equal(res.status, 200);
  assert.ok(res.body.accessToken);
  assert.equal(res.body.user.email, SIGNUP_BODY.email);

  const setCookie = res.headers["set-cookie"];
  assert.ok(setCookie?.some((c) => c.startsWith("refreshToken=")));
  assert.ok(setCookie?.some((c) => /HttpOnly/i.test(c)));
});

test("POST /auth/login fails with wrong password -- INVALID_CREDENTIALS", async () => {
  await request(app).post("/auth/signup").send(SIGNUP_BODY);
  const res = await request(app)
    .post("/auth/login")
    .send({ email: SIGNUP_BODY.email, password: "totally-wrong" });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
});

test("POST /auth/login fails identically for a nonexistent email as for a wrong password", async () => {
  const nonexistentRes = await request(app)
    .post("/auth/login")
    .send({ email: "nobody-registered@example.com", password: "whatever123" });

  await request(app).post("/auth/signup").send(SIGNUP_BODY);
  const wrongPasswordRes = await request(app)
    .post("/auth/login")
    .send({ email: SIGNUP_BODY.email, password: "totally-wrong" });

  assert.equal(nonexistentRes.status, 401);
  assert.equal(wrongPasswordRes.status, 401);
  assert.equal(nonexistentRes.body.error.code, wrongPasswordRes.body.error.code);
  assert.equal(nonexistentRes.body.error.message, wrongPasswordRes.body.error.message);
});

test("the access token's jti matches its paired RefreshToken row's id", async () => {
  const loginRes = await signupAndLogin();
  const decoded = jwt.decode(loginRes.body.accessToken);
  const dbResult = await pool.query("SELECT id FROM refresh_token WHERE id = $1", [
    Number(decoded.jti),
  ]);
  assert.equal(dbResult.rows.length, 1);
});

test("GET /users/me requires authentication", async () => {
  const res = await request(app).get("/users/me");
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "UNAUTHENTICATED");
});

test("GET /users/me returns the authenticated user's own profile", async () => {
  const loginRes = await signupAndLogin();
  const res = await request(app)
    .get("/users/me")
    .set("Authorization", `Bearer ${loginRes.body.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, SIGNUP_BODY.email);
});

test("PATCH /users/me updates the name but not the role", async () => {
  const loginRes = await signupAndLogin();
  const res = await request(app)
    .patch("/users/me")
    .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
    .send({ name: "New Name", role: "admin" });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.name, "New Name");
  assert.equal(res.body.user.role, "learner");
});

test("PATCH /users/me/password requires authentication", async () => {
  const res = await request(app)
    .patch("/users/me/password")
    .send({ currentPassword: SIGNUP_BODY.password, newPassword: "brand-new-password123" });
  assert.equal(res.status, 401);
});

test("PATCH /users/me/password changes the password and revokes the current session", async () => {
  const loginRes = await signupAndLogin();
  const res = await request(app)
    .patch("/users/me/password")
    .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
    .send({ currentPassword: SIGNUP_BODY.password, newPassword: "brand-new-password123" });
  assert.equal(res.status, 200);

  // The old password no longer works...
  const oldPasswordLoginRes = await request(app)
    .post("/auth/login")
    .send({ email: SIGNUP_BODY.email, password: SIGNUP_BODY.password });
  assert.equal(oldPasswordLoginRes.status, 401);

  // ...but the new one does.
  const newPasswordLoginRes = await request(app)
    .post("/auth/login")
    .send({ email: SIGNUP_BODY.email, password: "brand-new-password123" });
  assert.equal(newPasswordLoginRes.status, 200);

  // The session active when the password changed is revoked, same as passwordReset's confirm.
  const refreshRes = await request(app)
    .post("/auth/refresh")
    .set("Cookie", loginRes.headers["set-cookie"]);
  assert.equal(refreshRes.status, 401);
});

test("PATCH /users/me/password rejects a wrong current password with 401 INVALID_CREDENTIALS", async () => {
  const loginRes = await signupAndLogin();
  const res = await request(app)
    .patch("/users/me/password")
    .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
    .send({ currentPassword: "totally-wrong", newPassword: "brand-new-password123" });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
});

test("PATCH /users/me/password rejects a too-short new password with 400 VALIDATION_ERROR", async () => {
  const loginRes = await signupAndLogin();
  const res = await request(app)
    .patch("/users/me/password")
    .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
    .send({ currentPassword: SIGNUP_BODY.password, newPassword: "short" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("POST /auth/refresh rotates the token and issues a new access token", async () => {
  const loginRes = await signupAndLogin();
  const cookie = loginRes.headers["set-cookie"];

  const refreshRes = await request(app).post("/auth/refresh").set("Cookie", cookie);
  assert.equal(refreshRes.status, 200);
  assert.ok(refreshRes.body.accessToken);
  assert.notEqual(refreshRes.body.accessToken, loginRes.body.accessToken);
});

test("POST /auth/refresh fails with no cookie present", async () => {
  const res = await request(app).post("/auth/refresh");
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "UNAUTHENTICATED");
});

test("reusing an already-rotated refresh token revokes every session for that user", async () => {
  const loginRes = await signupAndLogin();
  const originalCookie = loginRes.headers["set-cookie"];

  const firstRefresh = await request(app).post("/auth/refresh").set("Cookie", originalCookie);
  assert.equal(firstRefresh.status, 200);
  const rotatedCookie = firstRefresh.headers["set-cookie"];

  // Reusing the now-revoked original token is the compromise signal (03-security-architecture.md
  // §2.6) -- must itself fail...
  const reuseAttempt = await request(app).post("/auth/refresh").set("Cookie", originalCookie);
  assert.equal(reuseAttempt.status, 401);

  // ...and must also have revoked the legitimately-rotated token as a side effect, since the
  // whole point is treating this as "every session for this user is now suspect."
  const secondRefreshAttempt = await request(app)
    .post("/auth/refresh")
    .set("Cookie", rotatedCookie);
  assert.equal(secondRefreshAttempt.status, 401);
});

test("POST /auth/logout revokes only the current device's session", async () => {
  await request(app).post("/auth/signup").send(SIGNUP_BODY);
  const loginA = await request(app)
    .post("/auth/login")
    .send({ email: SIGNUP_BODY.email, password: SIGNUP_BODY.password });
  const loginB = await request(app)
    .post("/auth/login")
    .send({ email: SIGNUP_BODY.email, password: SIGNUP_BODY.password });

  await request(app)
    .post("/auth/logout")
    .set("Authorization", `Bearer ${loginA.body.accessToken}`)
    .set("Cookie", loginA.headers["set-cookie"]);

  const meA = await request(app)
    .get("/users/me")
    .set("Authorization", `Bearer ${loginA.body.accessToken}`);
  assert.equal(meA.status, 401);

  const meB = await request(app)
    .get("/users/me")
    .set("Authorization", `Bearer ${loginB.body.accessToken}`);
  assert.equal(meB.status, 200);
});

test("POST /auth/logout-all revokes every session for the user", async () => {
  await request(app).post("/auth/signup").send(SIGNUP_BODY);
  const loginA = await request(app)
    .post("/auth/login")
    .send({ email: SIGNUP_BODY.email, password: SIGNUP_BODY.password });
  const loginB = await request(app)
    .post("/auth/login")
    .send({ email: SIGNUP_BODY.email, password: SIGNUP_BODY.password });

  await request(app)
    .post("/auth/logout-all")
    .set("Authorization", `Bearer ${loginA.body.accessToken}`);

  const meA = await request(app)
    .get("/users/me")
    .set("Authorization", `Bearer ${loginA.body.accessToken}`);
  assert.equal(meA.status, 401);

  const meB = await request(app)
    .get("/users/me")
    .set("Authorization", `Bearer ${loginB.body.accessToken}`);
  assert.equal(meB.status, 401);
});
