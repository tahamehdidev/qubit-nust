import { asyncHandler } from "../utils/asyncHandler.js";
import { userService } from "../services/user.service.js";
import { REFRESH_COOKIE_OPTIONS } from "./auth.controller.js";

export const getMeController = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.user.id);
  res.status(200).json({ user });
});

export const updateMeController = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user.id, req.validatedBody);
  res.status(200).json({ user });
});

// Phase 8D. changePassword() already revoked every session server-side (including this request's
// own) -- clearing the cookie here just makes the browser stop sending a now-meaningless token on
// its next request, same as logoutController.
export const changePasswordController = asyncHandler(async (req, res) => {
  await userService.changePassword(req.user.id, req.validatedBody);
  res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);
  res.status(200).end();
});
