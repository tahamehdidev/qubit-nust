import { Router } from "express";
import { validateBody } from "../middleware/validateBody.middleware.js";
import { UpdateProfileSchema, ChangePasswordSchema } from "../validators/user.validator.js";
import { changePasswordLimiter } from "../middleware/rateLimit.middleware.js";
import {
  getMeController,
  updateMeController,
  changePasswordController,
} from "../controllers/user.controller.js";

const router = Router();

router.get("/me", getMeController);
router.patch("/me", validateBody(UpdateProfileSchema), updateMeController);
router.patch(
  "/me/password",
  changePasswordLimiter,
  validateBody(ChangePasswordSchema),
  changePasswordController
);

export default router;
