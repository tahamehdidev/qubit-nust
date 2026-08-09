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

test("POST /courses as instructor creates a course owned by that instructor", async () => {
  const { user: instructor, accessToken } = await createUserWithToken({ role: "instructor" });
  const res = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Quantum Algorithms" });

  assert.equal(res.status, 201);
  assert.equal(res.body.course.title, "Quantum Algorithms");
  assert.equal(res.body.course.created_by_id, instructor.id);
});

test("POST /courses as learner is rejected -- role check", async () => {
  const { accessToken } = await createUserWithToken({ role: "learner" });
  const res = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Should not be created" });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "FORBIDDEN");
});

test("GET /courses/:courseId returns the course with nested chapters", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Quantum Hardware" });
  const courseId = courseRes.body.course.id;

  await request(app)
    .post(`/courses/${courseId}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter 1" });

  const res = await request(app)
    .get(`/courses/${courseId}`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.course.chapters.length, 1);
  assert.equal(res.body.course.chapters[0].title, "Chapter 1");
});

test("GET /lessons/:lessonId returns the lesson for any logged-in role, including learner", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { lesson } = await buildCourseHierarchy(instructorToken, { lessonTitle: "Qubits 101" });

  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const res = await request(app)
    .get(`/lessons/${lesson.id}`)
    .set("Authorization", `Bearer ${learnerToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.lesson.id, lesson.id);
  assert.equal(res.body.lesson.title, "Qubits 101");
});

test("GET /lessons/:lessonId for a nonexistent lesson returns 404", async () => {
  const { accessToken } = await createUserWithToken({ role: "learner" });
  const res = await request(app)
    .get("/lessons/999999")
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(res.status, 404);
});

// Nav-flow audit: the Lesson Player needs course_id (no standalone GET /chapters/:id exists to
// resolve it otherwise) and next_lesson_id (for "next lesson" navigation) directly on this
// response -- three cases below cover same-chapter, cross-chapter, and end-of-course.
test("GET /lessons/:lessonId includes course_id and next_lesson_id (next lesson in the same chapter)", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const courseId = courseRes.body.course.id;

  const chapterRes = await request(app)
    .post(`/courses/${courseId}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter 1" });
  const chapterId = chapterRes.body.chapter.id;

  const lesson1Res = await request(app)
    .post(`/chapters/${chapterId}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson 1" });
  const lesson2Res = await request(app)
    .post(`/chapters/${chapterId}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson 2" });

  const res = await request(app)
    .get(`/lessons/${lesson1Res.body.lesson.id}`)
    .set("Authorization", `Bearer ${accessToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.lesson.course_id, courseId);
  assert.equal(res.body.lesson.next_lesson_id, lesson2Res.body.lesson.id);
});

test("GET /lessons/:lessonId's next_lesson_id crosses into the next chapter's first lesson when this is the last lesson in its own chapter", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const courseId = courseRes.body.course.id;

  const chapter1Res = await request(app)
    .post(`/courses/${courseId}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter 1" });
  const chapter2Res = await request(app)
    .post(`/courses/${courseId}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter 2" });

  const lastLessonOfChapter1Res = await request(app)
    .post(`/chapters/${chapter1Res.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Last lesson of chapter 1" });
  const firstLessonOfChapter2Res = await request(app)
    .post(`/chapters/${chapter2Res.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "First lesson of chapter 2" });

  const res = await request(app)
    .get(`/lessons/${lastLessonOfChapter1Res.body.lesson.id}`)
    .set("Authorization", `Bearer ${accessToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.lesson.next_lesson_id, firstLessonOfChapter2Res.body.lesson.id);
});

test("GET /lessons/:lessonId's next_lesson_id is null for the last lesson of the course's last chapter", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const { lesson } = await buildCourseHierarchy(accessToken, { lessonTitle: "Only lesson" });

  const res = await request(app)
    .get(`/lessons/${lesson.id}`)
    .set("Authorization", `Bearer ${accessToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.lesson.next_lesson_id, null);
});

test("sequential chapter creates get distinct, incrementing order_index values", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const courseId = courseRes.body.course.id;

  const first = await request(app)
    .post(`/courses/${courseId}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "First" });
  const second = await request(app)
    .post(`/courses/${courseId}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Second" });

  assert.equal(first.body.chapter.order_index, 1);
  assert.equal(second.body.chapter.order_index, 2);
});

test("truly concurrent chapter creates under the same course still get distinct order_index values", async () => {
  // Fires both requests without awaiting the first before starting the second, so they're
  // genuinely in-flight at the same time -- this is the exact race withOrderedInsert's row lock
  // exists to prevent (simplicity-principles review, Milestone 2): without it, two concurrent
  // creates could both read the same "current max" and both compute the same order_index.
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Concurrency Test Course" });
  const courseId = courseRes.body.course.id;

  const [a, b, c] = await Promise.all([
    request(app)
      .post(`/courses/${courseId}/chapters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "A" }),
    request(app)
      .post(`/courses/${courseId}/chapters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "B" }),
    request(app)
      .post(`/courses/${courseId}/chapters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "C" }),
  ]);

  const orderIndexes = [a, b, c].map((res) => res.body.chapter.order_index).sort();
  assert.deepEqual(orderIndexes, [1, 2, 3]);
});

test("reorder with the exact sibling set succeeds", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const courseId = courseRes.body.course.id;
  const chapterA = await request(app)
    .post(`/courses/${courseId}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "A" });
  const chapterB = await request(app)
    .post(`/courses/${courseId}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "B" });

  const res = await request(app)
    .patch(`/courses/${courseId}/chapters/reorder`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ orderedIds: [chapterB.body.chapter.id, chapterA.body.chapter.id] });
  assert.equal(res.status, 200);

  const listRes = await request(app)
    .get(`/courses/${courseId}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(listRes.body.chapters[0].id, chapterB.body.chapter.id);
  assert.equal(listRes.body.chapters[1].id, chapterA.body.chapter.id);
});

test("reorder with a mismatched set is rejected -- 400 REORDER_SET_MISMATCH", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const courseId = courseRes.body.course.id;
  await request(app)
    .post(`/courses/${courseId}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "A" });

  const res = await request(app)
    .patch(`/courses/${courseId}/chapters/reorder`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ orderedIds: [999999] });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "REORDER_SET_MISMATCH");
});

test("DELETE /courses/:courseId without ?confirm=true is rejected", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const courseId = courseRes.body.course.id;

  const res = await request(app)
    .delete(`/courses/${courseId}`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
  assert.equal(res.body.error.field, "confirm");
});

test("DELETE /courses/:courseId?confirm=true cascades to chapters/lessons/screens", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const courseId = courseRes.body.course.id;
  const chapterRes = await request(app)
    .post(`/courses/${courseId}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter" });
  const lessonRes = await request(app)
    .post(`/chapters/${chapterRes.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson" });
  await request(app)
    .post(`/lessons/${lessonRes.body.lesson.id}/screens`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ type: "explanation", content: { text: "Hello" } });

  const res = await request(app)
    .delete(`/courses/${courseId}?confirm=true`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(res.status, 200);

  const chapterCheck = await pool.query("SELECT * FROM chapter WHERE id = $1", [
    chapterRes.body.chapter.id,
  ]);
  const lessonCheck = await pool.query("SELECT * FROM lesson WHERE id = $1", [
    lessonRes.body.lesson.id,
  ]);
  assert.equal(chapterCheck.rows.length, 0);
  assert.equal(lessonCheck.rows.length, 0);
});

// Regression test for a real bug found via manual dev-DB cleanup: progress.course_id's FK was
// created without ON DELETE CASCADE (migration 012), unlike chapter/lesson/screen -- deleting a
// course that a learner had actually submitted an attempt in threw an unhandled 500 (Postgres FK
// violation) instead of cascading, since a Progress row is created as a side effect of the first
// POST /attempts against that course. Fixed in migration 016.
test("DELETE /courses/:courseId?confirm=true cascades to Progress rows too", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { accessToken: learnerToken } = await createUserWithToken({ role: "learner" });
  const { course, screen } = await buildCourseHierarchy(instructorToken);

  const questionRes = await request(app)
    .post("/questions")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ prompt: "2+2?", type: "mcq", content: { options: ["3", "4"], correctOptionIndex: 1 } });
  await request(app)
    .post(`/screens/${screen.id}/questions`)
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ questionId: questionRes.body.question.id });
  await request(app)
    .post("/attempts")
    .set("Authorization", `Bearer ${learnerToken}`)
    .send({
      questionId: questionRes.body.question.id,
      contextType: "screen",
      contextId: screen.id,
      answer: { selectedOptionIndex: 1 },
    });

  const progressCheck = await pool.query("SELECT * FROM progress WHERE course_id = $1", [
    course.id,
  ]);
  assert.equal(progressCheck.rows.length, 1); // sanity check: the attempt really created one

  const res = await request(app)
    .delete(`/courses/${course.id}?confirm=true`)
    .set("Authorization", `Bearer ${instructorToken}`);
  assert.equal(res.status, 200);

  const progressAfterDelete = await pool.query("SELECT * FROM progress WHERE course_id = $1", [
    course.id,
  ]);
  assert.equal(progressAfterDelete.rows.length, 0);
});

test("an admin course-deletion writes an AuditLog entry with cascade counts", async () => {
  const { accessToken: instructorToken } = await createUserWithToken({ role: "instructor" });
  const { user: admin, accessToken: adminToken } = await createUserWithToken({ role: "admin" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ title: "Course" });
  const courseId = courseRes.body.course.id;
  await request(app)
    .post(`/courses/${courseId}/chapters`)
    .set("Authorization", `Bearer ${instructorToken}`)
    .send({ title: "Chapter" });

  await request(app)
    .delete(`/courses/${courseId}?confirm=true`)
    .set("Authorization", `Bearer ${adminToken}`);

  const auditRows = await pool.query(
    "SELECT * FROM audit_log WHERE action = 'course.deleted' AND user_id = $1",
    [admin.id]
  );
  assert.equal(auditRows.rows.length, 1);
  assert.equal(auditRows.rows[0].resource_id, String(courseId));
  assert.equal(auditRows.rows[0].metadata.cascadedChapters, 1);
});

test("DELETE /screens/:screenId needs no ?confirm=true -- leaf node", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const chapterRes = await request(app)
    .post(`/courses/${courseRes.body.course.id}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter" });
  const lessonRes = await request(app)
    .post(`/chapters/${chapterRes.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson" });
  const screenRes = await request(app)
    .post(`/lessons/${lessonRes.body.lesson.id}/screens`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ type: "explanation", content: { text: "Hello" } });

  const res = await request(app)
    .delete(`/screens/${screenRes.body.screen.id}`)
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(res.status, 200);
});

test("Screen.content is validated against its type's schema -- rejects a malformed simulation payload", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const chapterRes = await request(app)
    .post(`/courses/${courseRes.body.course.id}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter" });
  const lessonRes = await request(app)
    .post(`/chapters/${chapterRes.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson" });

  const res = await request(app)
    .post(`/lessons/${lessonRes.body.lesson.id}/screens`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ type: "simulation", content: { widgetType: "not_a_real_widget", params: {} } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("Screen.content accepts a valid simulation payload", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const chapterRes = await request(app)
    .post(`/courses/${courseRes.body.course.id}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter" });
  const lessonRes = await request(app)
    .post(`/chapters/${chapterRes.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson" });

  const res = await request(app)
    .post(`/lessons/${lessonRes.body.lesson.id}/screens`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      type: "simulation",
      content: { widgetType: "bloch_sphere", params: { mode: "free_placement" } },
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.screen.content.widgetType, "bloch_sphere");
});

// bloch_sphere's params are now validated per mode (Frontend Milestone 4 closed the gap the
// project plan named explicitly), not just "params is some object" -- these cover the three modes
// that had no documented shape at all before this, plus proof the tightened schema actually
// rejects bad input now rather than accepting anything object-shaped. node:test has no test.each,
// so a plain loop registers one test per case (each still reported individually).
const validBlochSphereParamsByMode = [
  { mode: "rotation_slider", sliderLabel: "Feature value" },
  { mode: "measurement", startState: "+" },
  { mode: "t1_decay", startState: "1", t1Ms: 1500 },
  { mode: "t2_dephasing", startState: "+", t2Ms: 1500 },
];

for (const params of validBlochSphereParamsByMode) {
  test(`Screen.content accepts a valid bloch_sphere ${params.mode} payload`, async () => {
    const { accessToken } = await createUserWithToken({ role: "instructor" });
    const courseRes = await request(app)
      .post("/courses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Course" });
    const chapterRes = await request(app)
      .post(`/courses/${courseRes.body.course.id}/chapters`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Chapter" });
    const lessonRes = await request(app)
      .post(`/chapters/${chapterRes.body.chapter.id}/lessons`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Lesson" });

    const res = await request(app)
      .post(`/lessons/${lessonRes.body.lesson.id}/screens`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ type: "simulation", content: { widgetType: "bloch_sphere", params } });
    assert.equal(res.status, 201);
    assert.equal(res.body.screen.content.params.mode, params.mode);
  });
}

test("Screen.content rejects a bloch_sphere payload with an unrecognized mode", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const chapterRes = await request(app)
    .post(`/courses/${courseRes.body.course.id}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter" });
  const lessonRes = await request(app)
    .post(`/chapters/${chapterRes.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson" });

  const res = await request(app)
    .post(`/lessons/${lessonRes.body.lesson.id}/screens`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      type: "simulation",
      content: { widgetType: "bloch_sphere", params: { mode: "not_a_real_mode" } },
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("Screen.content rejects a bloch_sphere t1_decay payload with a negative t1Ms", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const chapterRes = await request(app)
    .post(`/courses/${courseRes.body.course.id}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter" });
  const lessonRes = await request(app)
    .post(`/chapters/${chapterRes.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson" });

  const res = await request(app)
    .post(`/lessons/${lessonRes.body.lesson.id}/screens`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      type: "simulation",
      content: { widgetType: "bloch_sphere", params: { mode: "t1_decay", t1Ms: -5 } },
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("Screen.content rejects a bloch_sphere t2_dephasing payload with a negative t2Ms", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const chapterRes = await request(app)
    .post(`/courses/${courseRes.body.course.id}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter" });
  const lessonRes = await request(app)
    .post(`/chapters/${chapterRes.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson" });

  const res = await request(app)
    .post(`/lessons/${lessonRes.body.lesson.id}/screens`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      type: "simulation",
      content: { widgetType: "bloch_sphere", params: { mode: "t2_dephasing", t2Ms: -5 } },
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

// Phase 7E.2 -- gate_circuit_diagram, unlike bloch_sphere, had a real params schema from the
// start, so there's no "before/after" pair of tests the way bloch_sphere's own history has.
test("Screen.content accepts a valid gate_circuit_diagram payload", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const chapterRes = await request(app)
    .post(`/courses/${courseRes.body.course.id}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter" });
  const lessonRes = await request(app)
    .post(`/chapters/${chapterRes.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson" });

  const res = await request(app)
    .post(`/lessons/${lessonRes.body.lesson.id}/screens`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      type: "simulation",
      content: {
        widgetType: "gate_circuit_diagram",
        params: {
          qubitCount: 2,
          gates: [
            { type: "H", step: 0, qubits: [0] },
            { type: "CNOT", step: 1, qubits: [0, 1] },
            { type: "M", step: 2, qubits: [0] },
            { type: "M", step: 2, qubits: [1] },
          ],
        },
      },
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.screen.content.widgetType, "gate_circuit_diagram");
  assert.equal(res.body.screen.content.params.gates.length, 4);
});

test("Screen.content rejects a gate_circuit_diagram payload missing qubitCount", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const chapterRes = await request(app)
    .post(`/courses/${courseRes.body.course.id}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter" });
  const lessonRes = await request(app)
    .post(`/chapters/${chapterRes.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson" });

  const res = await request(app)
    .post(`/lessons/${lessonRes.body.lesson.id}/screens`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      type: "simulation",
      content: { widgetType: "gate_circuit_diagram", params: { gates: [] } },
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("Screen.content rejects a gate_circuit_diagram gate with an unrecognized type", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const chapterRes = await request(app)
    .post(`/courses/${courseRes.body.course.id}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter" });
  const lessonRes = await request(app)
    .post(`/chapters/${chapterRes.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson" });

  const res = await request(app)
    .post(`/lessons/${lessonRes.body.lesson.id}/screens`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      type: "simulation",
      content: {
        widgetType: "gate_circuit_diagram",
        params: { qubitCount: 1, gates: [{ type: "NOT_A_REAL_GATE", step: 0, qubits: [0] }] },
      },
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

// amplitude_bar_chart/topology_diagram/quadrant_selector/basis_encoder have no per-mode schema yet
// -- confirms they still fall back to the generic "params is an object" placeholder rather than
// bloch_sphere's tightened validation leaking onto widget types that don't have it.
test("Screen.content still accepts any object-shaped params for widget types without a per-mode schema", async () => {
  const { accessToken } = await createUserWithToken({ role: "instructor" });
  const courseRes = await request(app)
    .post("/courses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Course" });
  const chapterRes = await request(app)
    .post(`/courses/${courseRes.body.course.id}/chapters`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Chapter" });
  const lessonRes = await request(app)
    .post(`/chapters/${chapterRes.body.chapter.id}/lessons`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ title: "Lesson" });

  const res = await request(app)
    .post(`/lessons/${lessonRes.body.lesson.id}/screens`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      type: "simulation",
      content: { widgetType: "amplitude_bar_chart", params: { anything: true } },
    });
  assert.equal(res.status, 201);
});
