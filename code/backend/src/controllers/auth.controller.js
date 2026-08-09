import { asyncHandler } from "../utils/asyncHandler.js";
import { authService } from "../services/auth.service.js";
import { passwordResetService } from "../services/passwordReset.service.js";
import { env } from "../config/env.js";

// httpOnly/SameSite=Strict always (02-api-contract.md §2.1, 03-security-architecture.md §2.3).
// `secure` is conditioned on NODE_ENV rather than always true: a browser refuses to store a
// Secure cookie at all over plain HTTP, which would silently break login/refresh during local
// dev (http://localhost, no TLS). Production always runs behind HTTPS, so this never weakens
// the production guarantee.
//
// SameSite=Strict genuinely works in production, not just locally, because the frontend
// (code/frontend/vercel.json) proxies /api/* to the Render backend through Vercel's own edge --
// the browser only ever talks to https://qubit-nust.vercel.app, so this cookie is first-party
// from its perspective even though the real backend lives on a different domain. An earlier
// version of this deploy called the backend directly cross-origin instead, which made the
// cookie third-party -- SameSite=None was needed to make that work at all, but third-party
// cookies are exactly what Chrome/Safari increasingly block by default regardless of SameSite,
// which broke real sessions for real visitors. The proxy fixes the root cause instead of relaxing
// the cookie policy around it.
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
};

export const signupController = asyncHandler(async (req, res) => {
  const user = await authService.signup(req.validatedBody);
  res.status(201).json({ user });
});

export const loginController = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.validatedBody);
  res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);
  res.status(200).json({ user, accessToken });
});

export const refreshController = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken } = await authService.refresh(req.cookies.refreshToken);
  res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);
  res.status(200).json({ accessToken });
});

export const logoutController = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies.refreshToken);
  res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);
  res.status(200).end();
});

export const logoutAllController = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user.id);
  res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);
  res.status(200).end();
});

// Identical response regardless of whether the email belongs to a real account -- the enumeration
// safety lives in passwordResetService.requestReset() itself; this controller has nothing left to
// branch on even if it wanted to.
const PASSWORD_RESET_REQUESTED_MESSAGE =
  "If an account exists for that email, a password reset link has been sent.";

export const passwordResetRequestController = asyncHandler(async (req, res) => {
  await passwordResetService.requestReset(req.validatedBody.email);
  res.status(200).json({ message: PASSWORD_RESET_REQUESTED_MESSAGE });
});

export const passwordResetConfirmController = asyncHandler(async (req, res) => {
  await passwordResetService.confirmReset(req.validatedBody);
  res.status(200).end();
});
