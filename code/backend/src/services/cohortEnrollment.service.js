import { cohortEnrollmentRepository } from "../repositories/cohortEnrollment.repository.js";
import { progressRepository } from "../repositories/progress.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { normalizeEmail } from "../utils/normalizeEmail.js";
import { AppError } from "../errors/AppError.js";
import {
  InvalidRoleForActionError,
  DuplicateResourceError,
  NotFoundError,
} from "../errors/index.js";

// checkStudentOwnership was built in Milestone 4, ahead of the rest of this file, since
// requireStudentOwnership (ownership.middleware.js) needed it then.
//
// 02-api-contract.md §5.2 "Why courseId became required" (threat-model gap #3): a teaching
// relationship alone used to be sufficient, letting an instructor connected via one course see a
// student's data in every course they take. Access now requires BOTH an independent fact --
// (a) a teaching relationship via CohortEnrollment, and (b) the student having a Progress row for
// the specifically-requested courseId -- rather than one query that conflates them, since no
// schema link exists directly from Cohort to Course.
async function checkStudentOwnership(instructorId, targetUserId, courseId) {
  const hasRelationship = await cohortEnrollmentRepository.existsForInstructor(
    instructorId,
    targetUserId
  );
  if (!hasRelationship) return false;
  return progressRepository.existsForUserAndCourse(targetUserId, courseId);
}

// 02-api-contract.md §6.4's validation order, steps 2-4 (step 1, cohort ownership, is
// requireCohortOwnership before this ever runs). "Doesn't exist" and "isn't a learner" are one
// combined check -- INVALID_ROLE_FOR_ACTION either way, same treatment as cohort.service.js's own
// instructorId check, since a nonexistent user trivially isn't a learner either.
async function enroll(cohortId, userId) {
  const user = await userRepository.findById(userId);
  if (!user || user.role !== "learner") {
    throw new InvalidRoleForActionError(
      "userId must reference an existing learner account.",
      "userId"
    );
  }

  const enrollment = await cohortEnrollmentRepository.create(cohortId, userId);
  if (!enrollment) {
    throw new DuplicateResourceError(
      "This student already has an active enrollment in this cohort."
    );
  }
  return enrollment;
}

async function listForCohort(cohortId) {
  return cohortEnrollmentRepository.findAllForCohort(cohortId);
}

// GET /cohorts/mine (Phase 8D).
async function listForUser(userId) {
  return cohortEnrollmentRepository.findAllForUser(userId);
}

// Shared by two callers with different authorization stories, not two different operations:
// removeStudentController (instructor/admin, cohort-ownership-gated, any target userId) and
// leaveCohortController (Phase 8D -- a learner removing themselves, no ownership check needed
// since acting on your own userId needs no separate permission). Both just mean "this
// user's active enrollment in this cohort ends now."
async function remove(cohortId, userId) {
  const enrollment = await cohortEnrollmentRepository.markRemoved(cohortId, userId);
  if (!enrollment) {
    throw new NotFoundError("No active enrollment found for this student in this cohort.");
  }
  return enrollment;
}

// Phase 7B.2's secondary import path (self-enrollment via join code is primary). Reuses enroll()
// for each row rather than duplicating its validation -- a per-row failure never aborts the rest
// of the batch, which is the whole point of a bulk import over a script that stops at the first
// bad email in a hand-typed roster. Sequential, not parallel: CSV imports aren't a hot path, and
// sequential execution keeps each row's outcome simple to reason about.
async function bulkEnroll(cohortId, emails) {
  const results = [];
  for (const rawEmail of emails) {
    const email = normalizeEmail(rawEmail);
    const user = await userRepository.findByEmail(email);
    if (!user) {
      results.push({ email, status: "failed", reason: "No account found for this email." });
      continue;
    }
    try {
      await enroll(cohortId, user.id);
      results.push({ email, status: "enrolled" });
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      results.push({ email, status: "failed", reason: err.message });
    }
  }
  return results;
}

export const cohortEnrollmentService = {
  checkStudentOwnership,
  enroll,
  listForCohort,
  listForUser,
  remove,
  bulkEnroll,
};
