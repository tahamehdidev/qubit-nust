import { pool } from "../config/db.js";

// Built in Milestone 4, ahead of the rest of this file, since requireStudentOwnership (Variant B)
// needed it then. Deliberately no `WHERE status = 'active'` clause (03-security-architecture.md
// §3.4 Variant B) -- historical (removed) enrollments still count, so an instructor keeps access
// to a student's historical attempt/progress data after that student leaves their cohort.
async function existsForInstructor(instructorId, targetUserId) {
  const result = await pool.query(
    `SELECT 1 FROM cohort_enrollment ce
     JOIN cohort c ON c.id = ce.cohort_id
     WHERE c.instructor_id = $1 AND ce.user_id = $2
     LIMIT 1`,
    [instructorId, targetUserId]
  );
  return result.rows.length > 0;
}

// The partial unique index on (cohort_id, user_id) WHERE status = 'active' (01-data-model.md) is
// the actual enforcement mechanism for "already actively enrolled" -- caught here and returned as
// null so the service can translate it into a clean 409 (02-api-contract.md §6.4), same pattern
// as screenQuestion/practiceSetQuestion's attach().
async function create(cohortId, userId) {
  try {
    const result = await pool.query(
      "INSERT INTO cohort_enrollment (cohort_id, user_id) VALUES ($1, $2) RETURNING *",
      [cohortId, userId]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === "23505") return null; // unique_violation (one_active_enrollment_per_cohort)
    throw err;
  }
}

// "List enrolled students" (02-api-contract.md §6.2) means the current active roster -- distinct
// from existsForInstructor's deliberate inclusion of historical rows, which answers a different
// question (does this teaching relationship exist at all, ever) than this one (who is enrolled
// right now).
async function findAllForCohort(cohortId) {
  const result = await pool.query(
    `SELECT ce.id, ce.cohort_id, ce.user_id, ce.status, ce.enrolled_at, u.name, u.email
     FROM cohort_enrollment ce
     JOIN "user" u ON u.id = ce.user_id
     WHERE ce.cohort_id = $1 AND ce.status = 'active'
     ORDER BY ce.enrolled_at`,
    [cohortId]
  );
  return result.rows;
}

// PATCH, not DELETE, for removal (02-api-contract.md §6.1) -- the row is kept, only marked
// removed, to preserve enrollment history. Scoped to status = 'active' in the WHERE clause so
// removing an already-removed (or never-enrolled) pair returns null rather than a no-op update.
async function markRemoved(cohortId, userId) {
  const result = await pool.query(
    `UPDATE cohort_enrollment SET status = 'removed'
     WHERE cohort_id = $1 AND user_id = $2 AND status = 'active'
     RETURNING *`,
    [cohortId, userId]
  );
  return result.rows[0] ?? null;
}

// GET /cohorts/mine (Phase 8D) -- the read side of the join relationship a learner otherwise
// only ever writes to (POST /cohorts/join) and never sees again. Same active-only scoping as
// findAllForCohort, for the same reason: "which cohort(s) am I in" means right now, not ever.
async function findAllForUser(userId) {
  const result = await pool.query(
    `SELECT ce.id, ce.cohort_id, ce.enrolled_at, c.name AS cohort_name
     FROM cohort_enrollment ce
     JOIN cohort c ON c.id = ce.cohort_id
     WHERE ce.user_id = $1 AND ce.status = 'active'
     ORDER BY ce.enrolled_at`,
    [userId]
  );
  return result.rows;
}

// Cohort has no ON DELETE CASCADE from cohort_enrollment (01-data-model.md) -- unlike Course's
// hierarchy, enrollment history is deliberately preserved as long as the Cohort itself exists.
// Deleting the Cohort is the one action consequential enough to also remove its enrollment rows;
// cohort.service.js's remove() calls this explicitly before deleting the Cohort row itself.
async function deleteAllForCohort(cohortId) {
  const result = await pool.query("DELETE FROM cohort_enrollment WHERE cohort_id = $1", [cohortId]);
  return result.rowCount;
}

export const cohortEnrollmentRepository = {
  existsForInstructor,
  create,
  findAllForCohort,
  findAllForUser,
  markRemoved,
  deleteAllForCohort,
};
