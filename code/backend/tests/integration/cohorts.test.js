import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { resetDb, closeTestDb } from "../setup.js";
import { createUserWithToken } from "../helpers/testUsers.js";
import { buildCourseHierarchy } from "../helpers/courseHierarchy.js";

beforeEach(async () => {
  await resetDb();
});

after(async () => {
  await pool.end();
  await closeTestDb();
});

test("POST /cohorts as instructor creates a cohort owned by that instructor; a body instructorId is ignored", async () => {
  const { accessToken, user: instructor } = await createUserWithToken({ role: "instructor" });
  const { user: otherInstructor } = await createUserWithToken({ role: "instructor" });

  const res = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: "Cohort A", instructorId: otherInstructor.id });

  assert.equal(res.status, 201);
  assert.equal(res.body.cohort.instructor_id, instructor.id); // body instructorId ignored
});

test("POST /cohorts as admin with a valid instructorId creates a cohort on that instructor's behalf", async () => {
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });
  const { user: instructor } = await createUserWithToken({ role: "instructor" });

  const res = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: "Admin-created Cohort", instructorId: instructor.id });

  assert.equal(res.status, 201);
  assert.equal(res.body.cohort.instructor_id, instructor.id);
});

test("POST /cohorts as admin with an instructorId that isn't a real instructor -> 400 INVALID_ROLE_FOR_ACTION", async () => {
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });
  const { user: learner } = await createUserWithToken({ role: "learner" });

  const res = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: "Bad Cohort", instructorId: learner.id });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "INVALID_ROLE_FOR_ACTION");
});

test("GET /cohorts?instructorId=me lists only the caller's own cohorts", async () => {
  const { accessToken: instructorAToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: instructorBToken } = await createUserWithToken({ role: "instructor" });

  await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorAToken}`)
    .send({ name: "A's Cohort" });
  await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorBToken}`)
    .send({ name: "B's Cohort" });

  const res = await request(app)
    .get("/cohorts?instructorId=me")
    .set("Authorization", `Bearer ${instructorAToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.cohorts.length, 1);
  assert.equal(res.body.cohorts[0].name, "A's Cohort");
});

// Phase 8C.
test("GET /cohorts as admin lists every cohort platform-wide, with the owning instructor's name/email", async () => {
  const { accessToken: instructorAToken, user: instructorA } = await createUserWithToken({
    role: "instructor",
    name: "Instructor A",
    email: "instructor-a@example.com",
  });
  const { accessToken: instructorBToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });

  await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorAToken}`)
    .send({ name: "A's Cohort" });
  await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorBToken}`)
    .send({ name: "B's Cohort" });

  const res = await request(app).get("/cohorts").set("Authorization", `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.cohorts.length, 2);
  const cohortA = res.body.cohorts.find((c) => c.name === "A's Cohort");
  assert.equal(cohortA.instructor_id, instructorA.id);
  assert.equal(cohortA.instructor_name, "Instructor A");
  assert.equal(cohortA.instructor_email, "instructor-a@example.com");
});

test("GET /cohorts requires the instructor or admin role -- a learner gets 403", async () => {
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const res = await request(app).get("/cohorts").set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(res.status, 403);
});

test("cross-instructor access to GET/PATCH/DELETE /cohorts/:id -> 403; admin bypasses", async () => {
  const { accessToken: ownerToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: strangerToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });

  const createRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Owned Cohort" });
  const cohortId = createRes.body.cohort.id;

  const getRes = await request(app)
    .get(`/cohorts/${cohortId}`)
    .set("Authorization", `Bearer ${strangerToken}`);
  assert.equal(getRes.status, 403);

  const patchRes = await request(app)
    .patch(`/cohorts/${cohortId}`)
    .set("Authorization", `Bearer ${strangerToken}`)
    .send({ name: "Hijacked" });
  assert.equal(patchRes.status, 403);

  const deleteRes = await request(app)
    .delete(`/cohorts/${cohortId}`)
    .set("Authorization", `Bearer ${strangerToken}`);
  assert.equal(deleteRes.status, 403);

  const adminGetRes = await request(app)
    .get(`/cohorts/${cohortId}`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(adminGetRes.status, 200);
});

test("PATCH /cohorts/:id by admin reassigning instructorId writes a cohort.instructor_reassigned AuditLog row; a plain rename does not", async () => {
  const { accessToken: ownerToken, user: owner } = await createUserWithToken({
    role: "instructor",
  });
  const { accessToken: adminToken, user: admin } = await createUserWithToken({ role: "admin" });
  const { user: newInstructor } = await createUserWithToken({ role: "instructor" });

  const createRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Cohort" });
  const cohortId = createRes.body.cohort.id;

  const renameRes = await request(app)
    .patch(`/cohorts/${cohortId}`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Renamed Cohort" });
  assert.equal(renameRes.status, 200);
  assert.equal(renameRes.body.cohort.name, "Renamed Cohort");

  const reassignRes = await request(app)
    .patch(`/cohorts/${cohortId}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ instructorId: newInstructor.id });
  assert.equal(reassignRes.status, 200);
  assert.equal(reassignRes.body.cohort.instructor_id, newInstructor.id);

  const auditRows = await pool.query(
    "SELECT * FROM audit_log WHERE action = 'cohort.instructor_reassigned' AND user_id = $1",
    [admin.id]
  );
  assert.equal(auditRows.rows.length, 1);
  assert.equal(auditRows.rows[0].metadata.fromInstructorId, owner.id);
  assert.equal(auditRows.rows[0].metadata.toInstructorId, newInstructor.id);
});

test("DELETE /cohorts/:id writes a cohort.deleted AuditLog row and removes enrollment rows", async () => {
  const { accessToken: ownerToken, user: owner } = await createUserWithToken({
    role: "instructor",
  });
  const { user: learner } = await createUserWithToken({ role: "learner" });

  const createRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Cohort" });
  const cohortId = createRes.body.cohort.id;

  await request(app)
    .post(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ userId: learner.id });

  const deleteRes = await request(app)
    .delete(`/cohorts/${cohortId}`)
    .set("Authorization", `Bearer ${ownerToken}`);
  assert.equal(deleteRes.status, 200);

  const auditRows = await pool.query(
    "SELECT * FROM audit_log WHERE action = 'cohort.deleted' AND user_id = $1",
    [owner.id]
  );
  assert.equal(auditRows.rows.length, 1);
  assert.equal(auditRows.rows[0].metadata.removedEnrollments, 1);

  const enrollmentRows = await pool.query("SELECT * FROM cohort_enrollment WHERE cohort_id = $1", [
    cohortId,
  ]);
  assert.equal(enrollmentRows.rows.length, 0);
});

test("POST /cohorts/:id/students enrolls a learner; enrolling a non-learner or nonexistent userId -> 400 INVALID_ROLE_FOR_ACTION", async () => {
  const { accessToken: ownerToken } = await createUserWithToken({ role: "instructor" });
  const { user: learner } = await createUserWithToken({ role: "learner" });
  const { user: otherInstructor } = await createUserWithToken({ role: "instructor" });

  const createRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Cohort" });
  const cohortId = createRes.body.cohort.id;

  const enrollRes = await request(app)
    .post(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ userId: learner.id });
  assert.equal(enrollRes.status, 201);

  const nonLearnerRes = await request(app)
    .post(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ userId: otherInstructor.id });
  assert.equal(nonLearnerRes.status, 400);
  assert.equal(nonLearnerRes.body.error.code, "INVALID_ROLE_FOR_ACTION");

  const nonexistentRes = await request(app)
    .post(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ userId: "00000000-0000-0000-0000-000000000000" });
  assert.equal(nonexistentRes.status, 400);
  assert.equal(nonexistentRes.body.error.code, "INVALID_ROLE_FOR_ACTION");
});

test("double active enrollment for the same student in the same cohort -> 409 DUPLICATE_RESOURCE", async () => {
  const { accessToken: ownerToken } = await createUserWithToken({ role: "instructor" });
  const { user: learner } = await createUserWithToken({ role: "learner" });

  const createRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Cohort" });
  const cohortId = createRes.body.cohort.id;

  await request(app)
    .post(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ userId: learner.id });

  const dupeRes = await request(app)
    .post(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ userId: learner.id });
  assert.equal(dupeRes.status, 409);
  assert.equal(dupeRes.body.error.code, "DUPLICATE_RESOURCE");
});

test("GET /cohorts/:id/students lists the active roster; PATCH removal drops them from it but preserves the row, and allows re-enrollment", async () => {
  const { accessToken: ownerToken } = await createUserWithToken({ role: "instructor" });
  const { user: learner } = await createUserWithToken({ role: "learner", name: "Ada Learner" });

  const createRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Cohort" });
  const cohortId = createRes.body.cohort.id;

  await request(app)
    .post(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ userId: learner.id });

  const listBefore = await request(app)
    .get(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${ownerToken}`);
  assert.equal(listBefore.body.students.length, 1);
  assert.equal(listBefore.body.students[0].name, "Ada Learner");

  const removeRes = await request(app)
    .patch(`/cohorts/${cohortId}/students/${learner.id}`)
    .set("Authorization", `Bearer ${ownerToken}`);
  assert.equal(removeRes.status, 200);
  assert.equal(removeRes.body.enrollment.status, "removed");

  const listAfter = await request(app)
    .get(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${ownerToken}`);
  assert.equal(listAfter.body.students.length, 0);

  // The row still exists, just marked removed -- confirmed by re-enrollment succeeding rather
  // than colliding with a stale unique-violation from the old (now inactive) row.
  const reEnrollRes = await request(app)
    .post(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ userId: learner.id });
  assert.equal(reEnrollRes.status, 201);
});

test("PATCH removal of a student with no active enrollment -> 404", async () => {
  const { accessToken: ownerToken } = await createUserWithToken({ role: "instructor" });
  const { user: learner } = await createUserWithToken({ role: "learner" });

  const createRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Cohort" });
  const cohortId = createRes.body.cohort.id;

  const res = await request(app)
    .patch(`/cohorts/${cohortId}/students/${learner.id}`)
    .set("Authorization", `Bearer ${ownerToken}`);
  assert.equal(res.status, 404);
});

test("requireStudentOwnership keeps access via a removed (historical) enrollment -- a fix that adds a status='active' filter here should break this test", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken, user: learner } = await createUserWithToken({
    role: "learner",
  });
  const { screen, course } = await buildCourseHierarchy(instructorToken);

  const questionRes = await request(app)
    .post("/questions")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({
      prompt: "2+2?",
      type: "mcq",
      content: { options: ["3", "4"], correctOptionIndex: 1 },
    });
  const questionId = questionRes.body.question.id;
  await request(app)
    .post(`/screens/${screen.id}/questions`)
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ questionId });

  await request(app)
    .post("/attempts")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({
      questionId,
      contextType: "screen",
      contextId: screen.id,
      answer: { selectedOptionIndex: 1 },
    });

  const cohortRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ name: "Cohort" });
  const cohortId = cohortRes.body.cohort.id;
  await request(app)
    .post(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ userId: learner.id });

  const beforeRemoval = await request(app)
    .get(`/attempts?userId=${learner.id}&courseId=${course.id}`)
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(beforeRemoval.status, 200);

  await request(app)
    .patch(`/cohorts/${cohortId}/students/${learner.id}`)
    .set("Authorization", `Bearer ${instructorToken}`);

  const afterRemoval = await request(app)
    .get(`/attempts?userId=${learner.id}&courseId=${course.id}`)
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(afterRemoval.status, 200); // historical access preserved, not revoked
  assert.equal(afterRemoval.body.attempts.length, 1);
});

test("GET /cohorts/:id/dashboard/completion buckets students into completed/inProgress/notStarted correctly", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { user: learnerA } = await createUserWithToken({ role: "learner" });
  const { accessToken: learnerBToken, user: learnerB } = await createUserWithToken({
    role: "learner",
  });
  const { user: learnerC } = await createUserWithToken({ role: "learner" });
  const { screen, course } = await buildCourseHierarchy(instructorToken);

  const questionRes = await request(app)
    .post("/questions")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({
      prompt: "2+2?",
      type: "mcq",
      content: { options: ["3", "4"], correctOptionIndex: 1 },
    });
  const questionId = questionRes.body.question.id;
  await request(app)
    .post(`/screens/${screen.id}/questions`)
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ questionId });

  const cohortRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ name: "Cohort" });
  const cohortId = cohortRes.body.cohort.id;
  for (const learner of [learnerA, learnerB, learnerC]) {
    await request(app)
      .post(`/cohorts/${cohortId}/students`)
      .set("Authorization", `Bearer ${instructorToken}`)
      .send({ userId: learner.id });
  }

  // learnerA: never attempts -- not started.
  // learnerB: attempts correctly, then the Progress row is marked completed directly (no
  // endpoint sets completed_at anywhere in this codebase -- course-completion detection is
  // unspecified and out of scope; this proves the aggregation query reads whatever's there).
  const learnerBToken2 = learnerBToken;
  await request(app)
    .post("/attempts")
    .set("Authorization", `Bearer ${learnerBToken2}`)
    .send({
      questionId,
      contextType: "screen",
      contextId: screen.id,
      answer: { selectedOptionIndex: 1 },
    });
  await pool.query(
    "UPDATE progress SET completed_at = now() WHERE user_id = $1 AND course_id = $2",
    [learnerB.id, course.id]
  );

  const res = await request(app)
    .get(`/cohorts/${cohortId}/dashboard/completion`)
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.courses.length, 1);
  const stats = res.body.courses[0];
  assert.equal(stats.courseId, course.id);
  assert.equal(stats.totalStudents, 3);
  assert.equal(stats.completed, 1);
  assert.equal(stats.inProgress, 0);
  assert.equal(stats.notStarted, 2);
  assert.equal(stats.averageXp, 10); // only learnerB has a Progress row, at 10 xp
});

test("GET /cohorts/:id/dashboard/lesson-pacing averages the gap between a user's consecutive attempts in a lesson", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken, user: learner } = await createUserWithToken({
    role: "learner",
  });
  const { screen, lesson } = await buildCourseHierarchy(instructorToken);

  const questionRes = await request(app)
    .post("/questions")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({
      prompt: "2+2?",
      type: "mcq",
      content: { options: ["3", "4"], correctOptionIndex: 1 },
    });
  const questionId = questionRes.body.question.id;
  await request(app)
    .post(`/screens/${screen.id}/questions`)
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ questionId });

  const cohortRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ name: "Cohort" });
  const cohortId = cohortRes.body.cohort.id;
  await request(app)
    .post(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ userId: learner.id });

  // Two attempts inserted directly with a controlled 100-second gap -- the real /attempts
  // endpoint can't produce a deterministic gap at wall-clock speed, and this test is about the
  // aggregation query's arithmetic, not attempt-submission behavior (already covered elsewhere).
  await request(app)
    .post("/attempts")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({
      questionId,
      contextType: "screen",
      contextId: screen.id,
      answer: { selectedOptionIndex: 1 },
    });
  await pool.query(
    `UPDATE attempt SET attempted_at = now() - interval '100 seconds'
     WHERE id = (SELECT id FROM attempt WHERE user_id = $1 ORDER BY id LIMIT 1)`,
    [learner.id]
  );
  await pool.query(
    `INSERT INTO attempt (user_id, question_id, context_type, context_id, answer, is_correct, attempted_at)
     VALUES ($1, $2, 'screen', $3, '{"selectedOptionIndex":1}', true, now())`,
    [learner.id, questionId, screen.id]
  );

  const res = await request(app)
    .get(`/cohorts/${cohortId}/dashboard/lesson-pacing`)
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.lessons.length, 1);
  const pacing = res.body.lessons[0];
  assert.equal(pacing.lessonId, lesson.id);
  assert.equal(pacing.sampleSize, 1);
  assert.ok(
    Math.abs(pacing.averageInterQuestionSeconds - 100) <= 1,
    `expected ~100s, got ${pacing.averageInterQuestionSeconds}`
  );
  assert.match(pacing.note, /Approximate/);
});

test("POST /cohorts creates a cohort with a join_code; two cohorts never collide", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });

  const resA = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: "Cohort A" });
  const resB = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: "Cohort B" });

  assert.equal(resA.body.cohort.join_code.length, 8);
  assert.notEqual(resA.body.cohort.join_code, resB.body.cohort.join_code);
});

test("POST /cohorts/join enrolls the calling learner in the cohort matching the code (case-insensitive)", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken, user: learner } = await createUserWithToken({
    role: "learner",
  });

  const createRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ name: "Cohort" });
  const { id: cohortId, join_code: joinCode } = createRes.body.cohort;

  const joinRes = await request(app)
    .post("/cohorts/join")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({ joinCode: joinCode.toLowerCase() });

  assert.equal(joinRes.status, 201);
  assert.equal(joinRes.body.enrollment.cohort_id, cohortId);
  assert.equal(joinRes.body.enrollment.user_id, learner.id);
  assert.equal(joinRes.body.cohort.id, cohortId);
});

test("POST /cohorts/join with an unknown code -> 404; a non-learner caller -> 403", async () => {
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });

  const unknownRes = await request(app)
    .post("/cohorts/join")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({ joinCode: "NOTREAL1" });
  assert.equal(unknownRes.status, 404);

  const wrongRoleRes = await request(app)
    .post("/cohorts/join")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ joinCode: "WHATEVER" });
  assert.equal(wrongRoleRes.status, 403);
});

test("PATCH /cohorts/:id with regenerateJoinCode:true issues a new code; the old code stops working", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });

  const createRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ name: "Cohort" });
  const { id: cohortId, join_code: originalCode } = createRes.body.cohort;

  const regenRes = await request(app)
    .patch(`/cohorts/${cohortId}`)
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ regenerateJoinCode: true });
  assert.equal(regenRes.status, 200);
  assert.notEqual(regenRes.body.cohort.join_code, originalCode);

  const oldCodeRes = await request(app)
    .post("/cohorts/join")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({ joinCode: originalCode });
  assert.equal(oldCodeRes.status, 404);

  const newCodeRes = await request(app)
    .post("/cohorts/join")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({ joinCode: regenRes.body.cohort.join_code });
  assert.equal(newCodeRes.status, 201);
});

test("POST /cohorts/:id/students/bulk enrolls valid learner emails and reports per-row failures", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { user: learnerA } = await createUserWithToken({
    role: "learner",
    email: "bulk-a@example.com",
  });
  const { user: learnerB } = await createUserWithToken({
    role: "learner",
    email: "bulk-b@example.com",
  });
  const { user: nonLearner } = await createUserWithToken({
    role: "instructor",
    email: "bulk-instructor@example.com",
  });

  const createRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ name: "Cohort" });
  const cohortId = createRes.body.cohort.id;

  // Already-enrolled beforehand, to prove the bulk endpoint reports it as a per-row failure
  // rather than aborting the whole batch.
  await request(app)
    .post(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ userId: learnerA.id });

  const bulkRes = await request(app)
    .post(`/cohorts/${cohortId}/students/bulk`)
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({
      emails: [
        "bulk-a@example.com", // already enrolled -> failed
        "bulk-b@example.com", // valid -> enrolled
        nonLearner.email, // wrong role -> failed
        "nobody-registered@example.com", // no account -> failed
      ],
    });

  assert.equal(bulkRes.status, 200);
  const byEmail = Object.fromEntries(bulkRes.body.results.map((r) => [r.email, r]));
  assert.equal(byEmail["bulk-a@example.com"].status, "failed");
  assert.equal(byEmail["bulk-b@example.com"].status, "enrolled");
  assert.equal(byEmail[nonLearner.email].status, "failed");
  assert.equal(byEmail["nobody-registered@example.com"].status, "failed");

  const rosterRes = await request(app)
    .get(`/cohorts/${cohortId}/students`)
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(rosterRes.body.students.length, 2);
  assert.ok(rosterRes.body.students.some((s) => s.user_id === learnerB.id));
});

test("cross-instructor access to POST /cohorts/:id/students/bulk -> 403", async () => {
  const { accessToken: ownerToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: strangerToken } = await createUserWithToken({ role: "instructor" });

  const createRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Cohort" });
  const cohortId = createRes.body.cohort.id;

  const res = await request(app)
    .post(`/cohorts/${cohortId}/students/bulk`)
    .set("Authorization", `Bearer ${strangerToken}`)
    .send({ emails: ["someone@example.com"] });
  assert.equal(res.status, 403);
});

test("cross-instructor access to the dashboard endpoints -> 403; admin bypasses", async () => {
  const { accessToken: ownerToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: strangerToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });

  const cohortRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Cohort" });
  const cohortId = cohortRes.body.cohort.id;

  const completionRes = await request(app)
    .get(`/cohorts/${cohortId}/dashboard/completion`)
    .set("Authorization", `Bearer ${strangerToken}`);
  assert.equal(completionRes.status, 403);

  const pacingRes = await request(app)
    .get(`/cohorts/${cohortId}/dashboard/lesson-pacing`)
    .set("Authorization", `Bearer ${strangerToken}`);
  assert.equal(pacingRes.status, 403);

  const adminRes = await request(app)
    .get(`/cohorts/${cohortId}/dashboard/completion`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(adminRes.status, 200);
  assert.deepEqual(adminRes.body.courses, []); // no students, no Progress rows
});

// Phase 8D.
test("GET /cohorts/mine lists only the cohorts the caller has actively joined", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });

  const cohortRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ name: "Quantum 101" });
  const { id: cohortId, join_code: joinCode } = cohortRes.body.cohort;

  const beforeJoinRes = await request(app)
    .get("/cohorts/mine")
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(beforeJoinRes.status, 200);
  assert.deepEqual(beforeJoinRes.body.cohorts, []);

  await request(app)
    .post("/cohorts/join")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({ joinCode });

  const afterJoinRes = await request(app)
    .get("/cohorts/mine")
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(afterJoinRes.status, 200);
  assert.equal(afterJoinRes.body.cohorts.length, 1);
  assert.equal(afterJoinRes.body.cohorts[0].cohort_id, cohortId);
  assert.equal(afterJoinRes.body.cohorts[0].cohort_name, "Quantum 101");
});

test("GET /cohorts/mine requires the learner role -- an instructor gets 403", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const res = await request(app)
    .get("/cohorts/mine")
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(res.status, 403);
});

test("PATCH /cohorts/:id/students/me lets a learner leave their own cohort, dropping it from /cohorts/mine", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });

  const cohortRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ name: "Cohort" });
  const { id: cohortId, join_code: joinCode } = cohortRes.body.cohort;

  await request(app)
    .post("/cohorts/join")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({ joinCode });

  const leaveRes = await request(app)
    .patch(`/cohorts/${cohortId}/students/me`)
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(leaveRes.status, 200);
  assert.equal(leaveRes.body.enrollment.status, "removed");

  const mineRes = await request(app)
    .get("/cohorts/mine")
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.deepEqual(mineRes.body.cohorts, []);

  // Re-joining afterward still works -- leaving isn't a one-way lockout from that cohort.
  const rejoinRes = await request(app)
    .post("/cohorts/join")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({ joinCode });
  assert.equal(rejoinRes.status, 201);
});

test("PATCH /cohorts/:id/students/me with no active enrollment -> 404", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });

  const cohortRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ name: "Cohort" });

  const res = await request(app)
    .patch(`/cohorts/${cohortRes.body.cohort.id}/students/me`)
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(res.status, 404);
});

test("PATCH /cohorts/:id/students/me requires the learner role -- an instructor gets 403", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });

  const cohortRes = await request(app)
    .post("/cohorts")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ name: "Cohort" });

  const res = await request(app)
    .patch(`/cohorts/${cohortRes.body.cohort.id}/students/me`)
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(res.status, 403);
});
