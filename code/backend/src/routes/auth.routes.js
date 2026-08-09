import { Router } from "express";
import { validateBody } from "../middleware/validateBody.middleware.js";
import {
  SignupSchema,
  LoginSchema,
  PasswordResetRequestSchema,
  PasswordResetConfirmSchema,
} from "../validators/auth.validator.js";
import {
  signupIpLimiter,
  loginIpLimiter,
  loginAccountLimiter,
  logoutAccountLimiter,
  passwordResetRequestLimiter,
  passwordResetConfirmLimiter,
} from "../middleware/rateLimit.middleware.js";
import {
  signupController,
  loginController,
  refreshController,
  logoutController,
  logoutAllController,
  passwordResetRequestController,
  passwordResetConfirmController,
} from "../controllers/auth.controller.js";

const router = Router();

// Rate limiters run first among route-specific middleware (03-security-architecture.md §3.5).
router.post("/signup", signupIpLimiter, validateBody(SignupSchema), signupController);
router.post(
  "/login",
  loginIpLimiter,
  loginAccountLimiter,
  validateBody(LoginSchema),
  loginController
);
// Deliberately unthrottled -- the valid-token requirement is considered sufficient (§4.2).
router.post("/refresh", refreshController);
router.post("/logout", logoutAccountLimiter, logoutController);
router.post("/logout-all", logoutAccountLimiter, logoutAllController);
// Both public (auth.middleware.js's PUBLIC_ROUTES) -- a logged-out user is exactly who needs
// these, same as signup/login.
router.post(
  "/password-reset/request",
  passwordResetRequestLimiter,
  validateBody(PasswordResetRequestSchema),
  passwordResetRequestController
);
router.post(
  "/password-reset/confirm",
  passwordResetConfirmLimiter,
  validateBody(PasswordResetConfirmSchema),
  passwordResetConfirmController
);

export default router;
