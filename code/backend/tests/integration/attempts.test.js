// Milestone 4's dedicated risk-area coverage: the XP-award ordering rule (02-api-contract.md
// §5.3 steps 5-7) and requireStudentOwnership's threat-model-gap-#3 courseId scoping (§5.2).
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { resetDb, closeTestDb } from "../setup.js";
import { createUserWithToken } from "../helpers/testUsers.js";
import { buildCourseHierarchy } from "../helpers/courseHierarchy.js";

const MCQ_BODY = {
  prompt: "2+2?",
  type: "mcq",
  content: { options: ["3", "4"], correctOptionIndex: 1 },
};

beforeEach(async () => {
  await resetDb();
});

after(async () => {
  await pool.end();
  await closeTestDb();
});

async function attachMcqToScreen(instructorToken, screenId, extraFields = {}) {
  const createRes = await request(app)
    .post("/questions")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ ...MCQ_BODY, ...extraFields });
  const questionId = createRes.body.question.id;
  await request(app)
    .post(`/screens/${screenId}/questions`)
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ questionId });
  return questionId;
}

test("wrong -> correct -> correct again: full history preserved, xpAwarded true only once", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const { screen, course } = await buildCourseHierarchy(instructorToken);
  const questionId = await attachMcqToScreen(instructorToken, screen.id);

  const submit = (selectedOptionIndex) =>
    request(app).post("/attempts").set("Authorization", `Bearer ${learnerToken}`).send({
      questionId,
      contextType: "screen",
      contextId: screen.id,
      answer: { selectedOptionIndex },
    });

  const wrong = await submit(0);
  assert.equal(wrong.status, 201);
  assert.equal(wrong.body.attempt.isCorrect, false);
  assert.equal(wrong.body.attempt.xpAwarded, false);

  const correct = await submit(1);
  assert.equal(correct.status, 201);
  assert.equal(correct.body.attempt.isCorrect, true);
  assert.equal(correct.body.attempt.xpAwarded, true);

  const correctAgain = await submit(1);
  assert.equal(correctAgain.status, 201);
  assert.equal(correctAgain.body.attempt.isCorrect, true);
  assert.equal(correctAgain.body.attempt.xpAwarded, false);

  const history = await request(app)
    .get("/attempts?userId=me")
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(history.body.attempts.length, 3); // full history, nothing dropped

  const progress = await request(app)
    .get("/progress?userId=me")
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(progress.body.progress.length, 1);
  assert.equal(progress.body.progress[0].course_id, course.id);
  assert.equal(progress.body.progress[0].xp, 10); // awarded exactly once
});

test("correctAnswer is present and correctly shaped on an incorrect attempt, absent on a correct one", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const { screen } = await buildCourseHierarchy(instructorToken);
  const questionId = await attachMcqToScreen(instructorToken, screen.id);

  const submit = (selectedOptionIndex) =>
    request(app).post("/attempts").set("Authorization", `Bearer ${learnerToken}`).send({
      questionId,
      contextType: "screen",
      contextId: screen.id,
      answer: { selectedOptionIndex },
    });

  const wrong = await submit(0);
  assert.equal(wrong.body.attempt.isCorrect, false);
  assert.deepEqual(wrong.body.attempt.correctAnswer, { selectedOptionIndex: 1 });

  const correct = await submit(1);
  assert.equal(correct.body.attempt.isCorrect, true);
  assert.equal("correctAnswer" in correct.body.attempt, false);
});

test("explanation is present on both a correct and incorrect attempt, and absent from the pre-attempt question payload for a learner", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const { screen } = await buildCourseHierarchy(instructorToken);
  const explanation = "Because 2 + 2 = 4, not 3.";
  const questionId = await attachMcqToScreen(instructorToken, screen.id, { explanation });

  const preAttemptRes = await request(app)
    .get(`/questions/${questionId}`)
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(preAttemptRes.body.question.explanation, undefined);

  const submit = (selectedOptionIndex) =>
    request(app).post("/attempts").set("Authorization", `Bearer ${learnerToken}`).send({
      questionId,
      contextType: "screen",
      contextId: screen.id,
      answer: { selectedOptionIndex },
    });

  const wrong = await submit(0);
  assert.equal(wrong.body.attempt.explanation, explanation);

  const correct = await submit(1);
  assert.equal(correct.body.attempt.explanation, explanation);
});

test("explanation is null, not undefined, on an attempt for a question with none authored", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const { screen } = await buildCourseHierarchy(instructorToken);
  const questionId = await attachMcqToScreen(instructorToken, screen.id);

  const res = await request(app).post("/attempts").set("Authorization", `Bearer ${learnerToken}`).send({
    questionId,
    contextType: "screen",
    contextId: screen.id,
    answer: { selectedOptionIndex: 1 },
  });
  assert.equal(res.body.attempt.explanation, null);
});

test("context-mismatch: question exists but isn't attached to the given context -> 422", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const { screen } = await buildCourseHierarchy(instructorToken);

  const createRes = await request(app)
    .post("/questions")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send(MCQ_BODY);
  const questionId = createRes.body.question.id; // never attached to `screen`

  const res = await request(app)
    .post("/attempts")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({
      questionId,
      contextType: "screen",
      contextId: screen.id,
      answer: { selectedOptionIndex: 1 },
    });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, "CONTEXT_MISMATCH");
});

test("404 when questionId doesn't exist", async () => {
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const res = await request(app)
    .post("/attempts")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({
      questionId: 999999,
      contextType: "screen",
      contextId: 1,
      answer: { selectedOptionIndex: 0 },
    });
  assert.equal(res.status, 404);
});

test("404 when contextId doesn't exist in the table named by contextType", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const createRes = await request(app)
    .post("/questions")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send(MCQ_BODY);
  const questionId = createRes.body.question.id;

  const res = await request(app)
    .post("/attempts")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({
      questionId,
      contextType: "screen",
      contextId: 999999,
      answer: { selectedOptionIndex: 0 },
    });
  assert.equal(res.status, 404);
});

test("malformed answer shape for the question's type -> 400", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const { screen } = await buildCourseHierarchy(instructorToken);
  const questionId = await attachMcqToScreen(instructorToken, screen.id);

  const res = await request(app)
    .post("/attempts")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({
      questionId,
      contextType: "screen",
      contextId: screen.id,
      answer: { somethingElse: true },
    });
  assert.equal(res.status, 400);
});

test("GET /attempts?userId=me and GET /progress?userId=me work for a learner's own data", async () => {
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });

  const attemptsRes = await request(app)
    .get("/attempts?userId=me")
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(attemptsRes.status, 200);
  assert.deepEqual(attemptsRes.body.attempts, []);

  const progressRes = await request(app)
    .get("/progress?userId=me")
    .set("Authorization", `Bearer ${learnerToken}`);
  assert.equal(progressRes.status, 200);
  assert.deepEqual(progressRes.body.progress, []);
});

test("instructor omitting courseId when viewing another user's attempts -> 400", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { user: learner } = await createUserWithToken({ role: "learner" });

  const res = await request(app)
    .get(`/attempts?userId=${learner.id}`)
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.field, "courseId");
});

test("instructor with courseId but no teaching relationship to the student -> 403", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { user: learner } = await createUserWithToken({ role: "learner" });
  const { course } = await buildCourseHierarchy(instructorToken);

  const res = await request(app)
    .get(`/attempts?userId=${learner.id}&courseId=${course.id}`)
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(res.status, 403);
});

test("instructor with a teaching relationship AND the student's Progress in that course can view attempts/progress", async () => {
  const { accessToken: instructorToken, user: instructor } = await createUserWithToken({
    role: "instructor",
  });
  const { accessToken: learnerToken, user: learner } = await createUserWithToken({
    role: "learner",
  });
  const { screen, course } = await buildCourseHierarchy(instructorToken);
  const questionId = await attachMcqToScreen(instructorToken, screen.id);

  await request(app)
    .post("/attempts")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({
      questionId,
      contextType: "screen",
      contextId: screen.id,
      answer: { selectedOptionIndex: 1 },
    });

  // Cohort/CohortEnrollment CRUD doesn't exist until Milestone 5 -- inserted directly, same
  // precedent as tests/helpers/testUsers.js bypassing HTTP for instructor/admin identities.
  const cohortRes = await pool.query(
    "INSERT INTO cohort (name, instructor_id, join_code) VALUES ($1, $2, $3) RETURNING id",
    ["Test Cohort", instructor.id, "TESTCODE"]
  );
  await pool.query("INSERT INTO cohort_enrollment (cohort_id, user_id) VALUES ($1, $2)", [
    cohortRes.rows[0].id,
    learner.id,
  ]);

  const attemptsRes = await request(app)
    .get(`/attempts?userId=${learner.id}&courseId=${course.id}`)
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(attemptsRes.status, 200);
  assert.equal(attemptsRes.body.attempts.length, 1);

  const progressRes = await request(app)
    .get(`/progress?userId=${learner.id}&courseId=${course.id}`)
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(progressRes.status, 200);
  assert.equal(progressRes.body.progress.length, 1);
  assert.equal(progressRes.body.progress[0].xp, 10);
});

test("admin can view another user's attempts without courseId", async () => {
  const { accessToken: adminToken } = await createUserWithToken({ role: "admin" });
  const { user: learner } = await createUserWithToken({ role: "learner" });

  const res = await request(app)
    .get(`/attempts?userId=${learner.id}`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
});

test("learner cannot view another user's attempts at all, even without courseId", async () => {
  const { accessToken: learnerAToken } = await createUserWithToken({ role: "learner" });
  const { user: learnerB } = await createUserWithToken({ role: "learner" });

  const res = await request(app)
    .get(`/attempts?userId=${learnerB.id}`)
    .set("Authorization", `Bearer ${learnerAToken}`);
  assert.equal(res.status, 403);
});
