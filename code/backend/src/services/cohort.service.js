import { cohortRepository } from "../repositories/cohort.repository.js";
import { cohortEnrollmentRepository } from "../repositories/cohortEnrollment.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { auditLogService } from "./auditLog.service.js";
import { generateJoinCode, normalizeJoinCode } from "../utils/joinCode.js";
import { NotFoundError, ForbiddenError, InvalidRoleForActionError } from "../errors/index.js";

// 32^8 combinations makes an actual collision vanishingly unlikely -- this bounds the retry loop
// only as a defensive backstop, not because collisions are expected in practice.
const MAX_JOIN_CODE_ATTEMPTS = 5;

async function getById(id) {
  const cohort = await cohortRepository.findById(id);
  if (!cohort) throw new NotFoundError("Cohort not found.");
  return cohort;
}

// Public error message deliberately doesn't distinguish "no cohort has this code" from "this code
// was already regenerated" -- both are just "this code doesn't work anymore" to whoever typed it.
async function getByJoinCode(rawJoinCode) {
  const cohort = await cohortRepository.findByJoinCode(normalizeJoinCode(rawJoinCode));
  if (!cohort) throw new NotFoundError("Invalid join code.");
  return cohort;
}

async function listForInstructor(instructorId) {
  return cohortRepository.findAllForInstructor(instructorId);
}

// GET /cohorts as admin (Phase 8C) -- visibility only, not full management: an admin previously
// had no way to see any cohort it didn't already know the numeric id of.
async function listAll() {
  return cohortRepository.findAll();
}

// Resolves who a new Cohort's instructor_id is, per the server-side branching rule
// (02-api-contract.md §6.3): an instructor's own instructorId in the body is ignored (mass-
// assignment principle, same as signup's role field); an admin may set it explicitly, but it
// must reference a real instructor.
async function resolveInstructorId(instructorId, caller) {
  if (caller.role !== "admin" || !instructorId) return caller.id;

  const target = await userRepository.findById(instructorId);
  if (!target || target.role !== "instructor") {
    throw new InvalidRoleForActionError(
      "instructorId must reference an existing instructor.",
      "instructorId"
    );
  }
  return instructorId;
}

// Retries with a freshly generated code on the (extremely unlikely) chance the random code
// collides with an existing one -- cohortRepository.create()/updateJoinCode() both signal a
// collision by returning null rather than throwing, same convention as
// cohortEnrollmentRepository.create()'s unique-violation handling.
async function insertWithFreshJoinCode(insert) {
  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
    const result = await insert(generateJoinCode());
    if (result) return result;
  }
  throw new Error("Could not generate a unique cohort join code after several attempts.");
}

async function create({ name, instructorId }, caller) {
  const resolvedInstructorId = await resolveInstructorId(instructorId, caller);
  return insertWithFreshJoinCode((joinCode) =>
    cohortRepository.create({ name, instructorId: resolvedInstructorId, joinCode })
  );
}

// Reassignment (instructorId actually changing) is the one branch that gets audited
// (03-security-architecture.md §8.4's cohort.instructor_reassigned) -- a plain name-only update
// isn't a reassignment and doesn't log anything.
async function update(id, { name, instructorId, regenerateJoinCode }, caller) {
  const cohort = await getById(id);
  const resolvedInstructorId =
    instructorId !== undefined ? await resolveInstructorId(instructorId, caller) : undefined;
  const isReassignment =
    resolvedInstructorId !== undefined && resolvedInstructorId !== cohort.instructor_id;

  let updated = await cohortRepository.update(id, {
    name,
    instructorId: isReassignment ? resolvedInstructorId : undefined,
  });

  // A leaked/misused join code (Phase 7B.2) is revoked by replacing it, not by a separate
  // enable/disable flag -- the old code simply stops matching anything, same "the value itself is
  // the control" pattern as refresh_token/password_reset_token rotation.
  if (regenerateJoinCode) {
    updated = await insertWithFreshJoinCode((joinCode) =>
      cohortRepository.updateJoinCode(id, joinCode)
    );
  }

  if (isReassignment) {
    await auditLogService.record({
      userId: caller.id,
      action: "cohort.instructor_reassigned",
      resourceType: "Cohort",
      resourceId: String(id),
      metadata: { fromInstructorId: cohort.instructor_id, toInstructorId: resolvedInstructorId },
    });
  }

  return updated;
}

// Enrollment history has no ON DELETE CASCADE from Cohort (01-data-model.md) -- deleting the
// Cohort is explicitly orchestrated here rather than left to a DB-level cascade, since it's the
// one case where enrollment history doesn't outlive its Cohort.
async function remove(id, deletedByUserId) {
  await getById(id); // 404 before anything else
  const removedEnrollments = await cohortEnrollmentRepository.deleteAllForCohort(id);
  await cohortRepository.deleteById(id);
  await auditLogService.record({
    userId: deletedByUserId,
    action: "cohort.deleted",
    resourceType: "Cohort",
    resourceId: String(id),
    metadata: { removedEnrollments },
  });
}

async function checkOwnership(userId, cohortId) {
  const cohort = await getById(cohortId);
  if (cohort.instructor_id !== userId) throw new ForbiddenError("You do not own this cohort.");
  return cohort;
}

export const cohortService = {
  getById,
  getByJoinCode,
  listForInstructor,
  listAll,
  create,
  update,
  remove,
  checkOwnership,
};
