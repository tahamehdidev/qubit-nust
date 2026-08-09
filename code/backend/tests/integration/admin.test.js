import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { initDummyHash } from "../../src/utils/hash.js";
import { resetDb, closeTestDb } from "../setup.js";
import { createUserWithToken } from "../helpers/testUsers.js";

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

test("GET /admin/users requires the admin role -- a learner or instructor gets 403", async () => {
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });

  const learnerRes = await request(app)
    .get("/admin/users")
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(learnerRes.status, 403);

  const instructorRes = await request(app)
    .get("/admin/users")
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(instructorRes.status, 403);
});

test("GET /admin/users searches by name/email and filters by role", async () => {
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });
  await createUserWithToken({ role: "learner", name: "Ada Lovelace", email: "ada@example.com" });
  await createUserWithToken({
    role: "instructor",
    name: "Grace Hopper",
    email: "grace@example.com",
  });

  const searchRes = await request(app)
    .get("/admin/users?search=ada")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(searchRes.status, 200);
  assert.equal(searchRes.body.users.length, 1);
  assert.equal(searchRes.body.users[0].email, "ada@example.com");
  assert.equal(searchRes.body.users[0].password_hash, undefined);

  const roleRes = await request(app)
    .get("/admin/users?role=instructor")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(roleRes.status, 200);
  assert.ok(roleRes.body.users.every((u) => u.role === "instructor"));
  assert.ok(roleRes.body.users.some((u) => u.email === "grace@example.com"));
});

test("POST /admin/users creates an instructor account with a one-time generated password", async () => {
  const { accessToken: adminToken, user: admin } = await createUserWithToken({ role: "admin" });

  const res = await request(app)
    .post("/admin/users")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ email: "new-instructor@example.com", name: "New Instructor" });

  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, "instructor");
  assert.equal(res.body.user.email, "new-instructor@example.com");
  assert.ok(res.body.generatedPassword);

  const loginRes = await request(app)
    .post("/auth/login")
    .send({ email: "new-instructor@example.com", password: res.body.generatedPassword });
  assert.equal(loginRes.status, 200);

  const auditRows = await pool.query(
    "SELECT * FROM audit_log WHERE action = 'user.instructor_created_via_admin_ui'"
  );
  assert.equal(auditRows.rows.length, 1);
  assert.equal(auditRows.rows[0].metadata.createdByAdminId, admin.id);
});

test("POST /admin/users rejects a duplicate email with 409 EMAIL_ALREADY_REGISTERED", async () => {
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });
  await createUserWithToken({ role: "learner", email: "taken@example.com" });

  const res = await request(app)
    .post("/admin/users")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ email: "taken@example.com", name: "Someone" });

  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, "EMAIL_ALREADY_REGISTERED");
});

test("PATCH /admin/users/:userId/deactivate blocks future login and revokes existing sessions", async () => {
  const { accessToken: adminToken, user: admin } = await createUserWithToken({ role: "admin" });
  const { accessToken: learnerToken, user: learner } = await createUserWithToken({
    role: "learner",
    email: "target@example.com",
  });

  // The learner has an active session before deactivation.
  const meBefore = await request(app)
    .get("/users/me")
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(meBefore.status, 200);

  const deactivateRes = await request(app)
    .patch(`/admin/users/${learner.id}/deactivate`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(deactivateRes.status, 200);
  assert.ok(deactivateRes.body.user.deactivatedAt);

  // Existing session is now revoked.
  const meAfter = await request(app)
    .get("/users/me")
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(meAfter.status, 401);

  // Logging in again with the correct password is blocked.
  const loginRes = await request(app)
    .post("/auth/login")
    .send({ email: "target@example.com", password: "irrelevant-password-123" });
  assert.equal(loginRes.status, 403);
  assert.equal(loginRes.body.error.code, "ACCOUNT_DEACTIVATED");

  const auditRows = await pool.query(
    "SELECT * FROM audit_log WHERE action = 'user.deactivated' AND user_id = $1",
    [admin.id]
  );
  assert.equal(auditRows.rows.length, 1);
});

test("deactivating twice is idempotent -- keeps the original timestamp, no error", async () => {
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });
  const { user: learner } = await createUserWithToken({ role: "learner" });

  const first = await request(app)
    .patch(`/admin/users/${learner.id}/deactivate`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(first.status, 200);

  const second = await request(app)
    .patch(`/admin/users/${learner.id}/deactivate`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(second.status, 200);
  assert.equal(first.body.user.deactivatedAt, second.body.user.deactivatedAt);
});

test("PATCH /admin/users/:userId/deactivate for a nonexistent user -> 404", async () => {
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });

  const res = await request(app)
    .patch("/admin/users/00000000-0000-0000-0000-000000000000/deactivate")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(res.status, 404);
});

test("PATCH /admin/users/:userId/reactivate reverses a deactivation and lets the account log in again", async () => {
  const { accessToken: adminToken, user: admin } = await createUserWithToken({ role: "admin" });
  const { user: learner } = await createUserWithToken({
    role: "learner",
    email: "reactivate-target@example.com",
  });

  await request(app)
    .patch(`/admin/users/${learner.id}/deactivate`)
    .set("Authorization", `Bearer ${adminToken}`);

  const reactivateRes = await request(app)
    .patch(`/admin/users/${learner.id}/reactivate`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(reactivateRes.status, 200);
  assert.equal(reactivateRes.body.user.deactivatedAt, null);

  const loginRes = await request(app)
    .post("/auth/login")
    .send({ email: "reactivate-target@example.com", password: "irrelevant-password-123" });
  assert.equal(loginRes.status, 200);

  const auditRows = await pool.query(
    "SELECT * FROM audit_log WHERE action = 'user.reactivated' AND user_id = $1",
    [admin.id]
  );
  assert.equal(auditRows.rows.length, 1);
});

test("PATCH /admin/users/:userId/reactivate for a nonexistent user -> 404", async () => {
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });
  const res = await request(app)
    .patch("/admin/users/00000000-0000-0000-0000-000000000000/reactivate")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(res.status, 404);
});

test("PATCH /admin/users/:userId/role changes a learner to an instructor and records an audit entry", async () => {
  const { accessToken: adminToken, user: admin } = await createUserWithToken({ role: "admin" });
  const { user: learner } = await createUserWithToken({ role: "learner" });

  const res = await request(app)
    .patch(`/admin/users/${learner.id}/role`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ role: "instructor" });

  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, "instructor");

  const auditRows = await pool.query(
    "SELECT * FROM audit_log WHERE action = 'user.role_changed' AND user_id = $1",
    [admin.id]
  );
  assert.equal(auditRows.rows.length, 1);
  assert.equal(auditRows.rows[0].metadata.previousRole, "learner");
  assert.equal(auditRows.rows[0].metadata.newRole, "instructor");
});

test("PATCH /admin/users/:userId/role rejects role=admin with 400 VALIDATION_ERROR", async () => {
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });
  const { user: learner } = await createUserWithToken({ role: "learner" });

  const res = await request(app)
    .patch(`/admin/users/${learner.id}/role`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ role: "admin" });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("PATCH /admin/users/:userId/role refuses to act on a target who is already an admin", async () => {
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });
  const { user: otherAdmin } = await createUserWithToken({ role: "admin" });

  const res = await request(app)
    .patch(`/admin/users/${otherAdmin.id}/role`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ role: "instructor" });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "INVALID_ROLE_FOR_ACTION");
});

test("PATCH /admin/users/:userId/role requires the admin role -- a learner or instructor gets 403", async () => {
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const { user: target } = await createUserWithToken({ role: "learner" });

  const res = await request(app)
    .patch(`/admin/users/${target.id}/role`)
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({ role: "instructor" });

  assert.equal(res.status, 403);
});
