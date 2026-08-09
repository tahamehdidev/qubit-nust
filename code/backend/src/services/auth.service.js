import { userRepository } from "../repositories/user.repository.js";
import { refreshTokenService } from "./refreshToken.service.js";
import { toPublicUser } from "./user.service.js";
import { hashPassword, verifyPassword, getDummyHash } from "../utils/hash.js";
import { normalizeEmail } from "../utils/normalizeEmail.js";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  UnauthenticatedError,
  AccountDeactivatedError,
} from "../errors/index.js";

async function signup({ email, password, name }) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await userRepository.findByEmail(normalizedEmail);
  if (existing) {
    throw new EmailAlreadyRegisteredError();
  }

  const passwordHash = await hashPassword(password);
  // role is always forced to "learner" server-side (02-api-contract.md §2.1) -- there is no
  // parameter here to override it with.
  const user = await userRepository.create({
    email: normalizedEmail,
    passwordHash,
    name,
    role: "learner",
  });
  return toPublicUser(user);
}

async function login({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await userRepository.findByEmail(normalizedEmail);

  // Timing-safe: a verify call always runs, even for a nonexistent user, against a precomputed
  // dummy hash -- 03-security-architecture.md §1.3. Both cases return the identical error and
  // take the same ~250-500ms.
  const hashToCompare = user ? user.password_hash : getDummyHash();
  const isValid = await verifyPassword(hashToCompare, password);

  if (!user || !isValid) {
    throw new InvalidCredentialsError();
  }

  // Checked only after a real password match, deliberately -- this does confirm the account
  // exists to whoever just typed its correct password, but that's the account's own owner (or
  // someone who already has its credentials, a bigger problem this check doesn't make worse),
  // not a stranger probing for valid emails the way INVALID_CREDENTIALS' uniform message guards
  // against above (Phase 7C.1).
  if (user.deactivated_at) {
    throw new AccountDeactivatedError();
  }

  const { rawToken, accessToken } = await refreshTokenService.issue({
    userId: user.id,
    role: user.role,
    email: user.email,
  });

  return { user: toPublicUser(user), accessToken, refreshToken: rawToken };
}

const SESSION_EXPIRED_MESSAGE = "Session expired. Please log in again.";

async function refresh(rawToken) {
  if (!rawToken) {
    throw new UnauthenticatedError(SESSION_EXPIRED_MESSAGE);
  }

  const revoked = await refreshTokenService.rotate(rawToken);
  if (!revoked) {
    // Token never existed, already expired/revoked, or lost a rotation race -- all three return
    // the same generic response, per 03-security-architecture.md §2.6.
    throw new UnauthenticatedError(SESSION_EXPIRED_MESSAGE);
  }

  // No existence check on the looked-up user: refresh_token.user_id cascades from "user" (id)
  // ON DELETE CASCADE (migrations/002), so a refresh_token row -- the one `rotate()` just
  // returned -- can never outlive its user. Trusting that FK guarantee here rather than
  // re-guarding against an impossible case.
  const user = await userRepository.findById(revoked.user_id);

  const { rawToken: newRawToken, accessToken } = await refreshTokenService.issue({
    userId: user.id,
    role: user.role,
    email: user.email,
  });

  return { accessToken, refreshToken: newRawToken };
}

async function logout(rawToken) {
  if (!rawToken) return;
  await refreshTokenService.revokeByRawToken(rawToken);
}

async function logoutAll(userId) {
  await refreshTokenService.revokeAllForUser(userId);
}

export const authService = { signup, login, refresh, logout, logoutAll };
