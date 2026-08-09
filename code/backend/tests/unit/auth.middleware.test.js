import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { authMiddleware } from "../../src/middleware/auth.middleware.js";

// Standalone app, same pattern as rateLimit.test.js/errorHandler.test.js -- stub handlers only,
// no DB, so this stays a true unit test of the whitelist matching logic itself, not an
// integration test of the real course/chapter/lesson controllers.
function buildApp() {
  const app = express();
  app.use(authMiddleware);
  app.get("/health", (req, res) => res.status(200).json({ ok: true }));
  app.get("/courses", (req, res) => res.status(200).json({ ok: true }));
  app.get("/courses/:courseId", (req, res) => res.status(200).json({ ok: true }));
  app.get("/courses/:courseId/chapters", (req, res) => res.status(200).json({ ok: true }));
  app.get("/chapters/:chapterId/lessons", (req, res) => res.status(200).json({ ok: true }));
  app.get("/lessons/:lessonId/screens", (req, res) => res.status(200).json({ ok: true }));
  app.post("/courses", (req, res) => res.status(201).json({ ok: true }));
  app.post("/auth/password-reset/request", (req, res) => res.status(200).json({ ok: true }));
  app.post("/auth/password-reset/confirm", (req, res) => res.status(200).json({ ok: true }));
  app.post("/cohorts/join", (req, res) => res.status(201).json({ ok: true }));
  app.get("/admin/users", (req, res) => res.status(200).json({ ok: true }));
  app.post("/admin/users", (req, res) => res.status(201).json({ ok: true }));
  app.use((err, req, res, next) => res.status(err.statusCode ?? 500).json({ error: err.code }));
  return app;
}

test("Phase 5.5 syllabus-preview paths are reachable with no Authorization header", async () => {
  const app = buildApp();
  for (const path of ["/courses", "/courses/9", "/courses/9/chapters", "/chapters/15/lessons"]) {
    const res = await request(app).get(path);
    assert.equal(res.status, 200, `${path} should be public`);
  }
});

test("lesson content (screens) still requires auth -- only the syllabus is public", async () => {
  const res = await request(buildApp()).get("/lessons/33/screens");
  assert.equal(res.status, 401);
});

test("whitelisting is method-specific: POST /courses is not opened up by GET /courses being public", async () => {
  const res = await request(buildApp()).post("/courses");
  assert.equal(res.status, 401);
});

test("the pre-existing GET /health whitelist entry still works (no regression)", async () => {
  const res = await request(buildApp()).get("/health");
  assert.equal(res.status, 200);
});

// Phase 7B.3 access-model regression check -- these must stay public (a logged-out user is
// exactly who needs them), re-verified explicitly rather than assumed to still hold after
// Phase 7B.1 added them.
test("Phase 7B.1 password-reset request/confirm are reachable with no Authorization header", async () => {
  const app = buildApp();
  for (const path of ["/auth/password-reset/request", "/auth/password-reset/confirm"]) {
    const res = await request(app).post(path);
    assert.equal(res.status, 200, `${path} should be public`);
  }
});

// Phase 7B.3 access-model regression check -- these must stay behind auth, re-verified
// explicitly rather than assumed to still hold after Phase 7B.2/7C.1 added them. Both are new
// surface area introduced since the whitelist's own last documented review.
test("Phase 7B.2's POST /cohorts/join requires authentication -- not whitelisted", async () => {
  const res = await request(buildApp()).post("/cohorts/join");
  assert.equal(res.status, 401);
});

test("Phase 7C.1's admin routes require authentication -- not whitelisted", async () => {
  const app = buildApp();
  const getRes = await request(app).get("/admin/users");
  assert.equal(getRes.status, 401);
  const postRes = await request(app).post("/admin/users");
  assert.equal(postRes.status, 401);
});
