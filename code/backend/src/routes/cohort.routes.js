import { Router } from "express";
import { validateBody } from "../middleware/validateBody.middleware.js";
import { validateIntParam, validateUuidParam } from "../middleware/validateParams.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { requireCohortOwnership } from "../middleware/ownership.middleware.js";
import {
  cohortEnrollLimiter,
  cohortAdminReassignLimiter,
  cohortJoinLimiter,
} from "../middleware/rateLimit.middleware.js";
import { CreateCohortSchema, UpdateCohortSchema } from "../validators/cohort.validator.js";
import {
  EnrollStudentSchema,
  JoinCohortSchema,
  BulkEnrollSchema,
} from "../validators/cohortEnrollment.validator.js";
import {
  getCohortController,
  listCohortsController,
  createCohortController,
  updateCohortController,
  deleteCohortController,
} from "../controllers/cohort.controller.js";
import {
  listStudentsController,
  enrollStudentController,
  removeStudentController,
  joinCohortController,
  bulkEnrollController,
  listMyCohortsController,
  leaveCohortController,
} from "../controllers/cohortEnrollment.controller.js";
import {
  getCompletionController,
  getLessonPacingController,
} from "../controllers/dashboard.controller.js";

const router = Router();

// Phase 8C: extended to admin, unlike every other route in this file that already had both from
// day one -- listCohortsController itself branches on role (own cohorts for an instructor,
// platform-wide for an admin).
router.get("/", requireRole("instructor", "admin"), listCohortsController);

// Phase 7B.2's primary self-enrollment path. Learner-only -- an instructor/admin account has no
// reason to "join" a cohort as a student, so this is gated the same way rather than left to
// enroll()'s own role check to produce a more confusing error about the caller's own account.
// No requireCohortOwnership here: there's no cohortId in the URL to check ownership of yet --
// resolving which cohort the join code refers to IS what this endpoint does.
router.post(
  "/join",
  requireRole("learner"),
  cohortJoinLimiter,
  validateBody(JoinCohortSchema),
  joinCohortController
);

// Phase 8D. Registered before "/:cohortId" so "mine" is never captured as a cohortId value --
// same reasoning as "/join" above.
router.get("/mine", requireRole("learner"), listMyCohortsController);

router.get(
  "/:cohortId",
  validateIntParam("cohortId"),
  requireRole("instructor", "admin"),
  requireCohortOwnership,
  getCohortController
);

// Rate limiter runs first among route-specific middleware (03-security-architecture.md §3.5).
// cohortAdminReassignLimiter no-ops unless this specific request is an admin reassigning
// ownership via instructorId -- ordinary creates are unthrottled, same as Groups 2-3.
router.post(
  "/",
  requireRole("instructor", "admin"),
  cohortAdminReassignLimiter,
  validateBody(CreateCohortSchema),
  createCohortController
);

router.patch(
  "/:cohortId",
  validateIntParam("cohortId"),
  requireRole("instructor", "admin"),
  requireCohortOwnership,
  validateBody(UpdateCohortSchema),
  updateCohortController
);

router.delete(
  "/:cohortId",
  validateIntParam("cohortId"),
  requireRole("instructor", "admin"),
  requireCohortOwnership,
  deleteCohortController
);

router.get(
  "/:cohortId/students",
  validateIntParam("cohortId"),
  requireRole("instructor", "admin"),
  requireCohortOwnership,
  listStudentsController
);

router.post(
  "/:cohortId/students",
  validateIntParam("cohortId"),
  requireRole("instructor", "admin"),
  requireCohortOwnership,
  cohortEnrollLimiter,
  validateBody(EnrollStudentSchema),
  enrollStudentController
);

// Phase 8D. Registered before "/:cohortId/students/:userId" so "me" is never captured by
// validateUuidParam("userId") and rejected as a malformed UUID -- same "register the literal
// segment first" pattern as "/mine" above. No requireCohortOwnership: a learner leaving their own
// enrollment needs no ownership check, unlike an instructor/admin removing someone else's.
router.patch(
  "/:cohortId/students/me",
  validateIntParam("cohortId"),
  requireRole("learner"),
  leaveCohortController
);

router.patch(
  "/:cohortId/students/:userId",
  validateIntParam("cohortId"),
  validateUuidParam("userId"),
  requireRole("instructor", "admin"),
  requireCohortOwnership,
  removeStudentController
);

// Phase 7B.2's secondary import path -- same rate limiter as the single-student enroll route
// above, since it's the same actor/risk category (an authenticated instructor enrolling
// students), just a different request shape.
router.post(
  "/:cohortId/students/bulk",
  validateIntParam("cohortId"),
  requireRole("instructor", "admin"),
  requireCohortOwnership,
  cohortEnrollLimiter,
  validateBody(BulkEnrollSchema),
  bulkEnrollController
);

// Read-only, aggregated, same ownership check as the rest of this file (02-api-contract.md §7.1).
router.get(
  "/:cohortId/dashboard/completion",
  validateIntParam("cohortId"),
  requireRole("instructor", "admin"),
  requireCohortOwnership,
  getCompletionController
);

router.get(
  "/:cohortId/dashboard/lesson-pacing",
  validateIntParam("cohortId"),
  requireRole("instructor", "admin"),
  requireCohortOwnership,
  getLessonPacingController
);

export default router;
