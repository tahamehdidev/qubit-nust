import { Router } from "express";
import { requireRole } from "../middleware/role.middleware.js";
import { validateBody } from "../middleware/validateBody.middleware.js";
import { validateUuidParam } from "../middleware/validateParams.middleware.js";
import { CreateInstructorSchema, ChangeUserRoleSchema } from "../validators/admin.validator.js";
import {
  listUsersController,
  createInstructorController,
  deactivateUserController,
  reactivateUserController,
  changeUserRoleController,
} from "../controllers/admin.controller.js";

const router = Router();

// Admin-only, no rate limiting -- same "already filtered to a small, trusted role group"
// reasoning as content-authoring writes (03-security-architecture.md §4.2).
router.get("/users", requireRole("admin"), listUsersController);
router.post(
  "/users",
  requireRole("admin"),
  validateBody(CreateInstructorSchema),
  createInstructorController
);
router.patch(
  "/users/:userId/deactivate",
  requireRole("admin"),
  validateUuidParam("userId"),
  deactivateUserController
);
router.patch(
  "/users/:userId/reactivate",
  requireRole("admin"),
  validateUuidParam("userId"),
  reactivateUserController
);
router.patch(
  "/users/:userId/role",
  requireRole("admin"),
  validateUuidParam("userId"),
  validateBody(ChangeUserRoleSchema),
  changeUserRoleController
);

export default router;
