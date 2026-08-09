import { Router } from "express";
import { requireRole } from "../middleware/role.middleware.js";
import { validateBody } from "../middleware/validateBody.middleware.js";
import { validateUuidParam } from "../middleware/validateParams.middleware.js";
import { CreateInstructorSchema } from "../validators/admin.validator.js";
import {
  listUsersController,
  createInstructorController,
  deactivateUserController,
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

export default router;
