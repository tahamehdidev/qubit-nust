import { asyncHandler } from "../utils/asyncHandler.js";
import { cohortEnrollmentService } from "../services/cohortEnrollment.service.js";
import { cohortService } from "../services/cohort.service.js";

export const listStudentsController = asyncHandler(async (req, res) => {
  const students = await cohortEnrollmentService.listForCohort(Number(req.params.cohortId));
  res.status(200).json({
    students,
    pagination: { page: 1, limit: students.length, total: students.length },
  });
});

export const enrollStudentController = asyncHandler(async (req, res) => {
  const enrollment = await cohortEnrollmentService.enroll(
    Number(req.params.cohortId),
    req.validatedBody.userId
  );
  res.status(201).json({ enrollment });
});

// PATCH, not DELETE (02-api-contract.md §6.1) -- marks the enrollment removed, doesn't delete it.
export const removeStudentController = asyncHandler(async (req, res) => {
  const enrollment = await cohortEnrollmentService.remove(
    Number(req.params.cohortId),
    req.params.userId
  );
  res.status(200).json({ enrollment });
});

// Phase 7B.2's primary self-enrollment path -- resolves the cohort from the submitted join code,
// then enrolls the caller (never a userId in the body: a learner can only ever join themselves).
export const joinCohortController = asyncHandler(async (req, res) => {
  const cohort = await cohortService.getByJoinCode(req.validatedBody.joinCode);
  const enrollment = await cohortEnrollmentService.enroll(cohort.id, req.user.id);
  res.status(201).json({ enrollment, cohort: { id: cohort.id, name: cohort.name } });
});

export const bulkEnrollController = asyncHandler(async (req, res) => {
  const results = await cohortEnrollmentService.bulkEnroll(
    Number(req.params.cohortId),
    req.validatedBody.emails
  );
  res.status(200).json({ results });
});
