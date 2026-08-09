import crypto from "node:crypto";
import { userRepository } from "../repositories/user.repository.js";
import { refreshTokenService } from "./refreshToken.service.js";
import { auditLogService } from "./auditLog.service.js";
import { hashPassword, verifyPassword } from "../utils/hash.js";
import { normalizeEmail } from "../utils/normalizeEmail.js";
import {
  NotFoundError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from "../errors/index.js";

// password_hash is never returned in any response, from any endpoint (02-api-contract.md §2.3) --
// this is the one shape every caller (including auth.service.js) converts a raw User row through
// before it reaches a controller. deactivatedAt is safe to include -- it's not sensitive, and
// Phase 7C.1's admin UI needs it to show which accounts are deactivated.
export function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    deactivatedAt: user.deactivated_at,
  };
}

async function getById(id) {
  const user = await userRepository.findById(id);
  if (!user) throw new NotFoundError("User not found.");
  return toPublicUser(user);
}

async function updateProfile(id, { name }) {
  const user = await userRepository.updateName(id, name);
  if (!user) throw new NotFoundError("User not found.");
  return toPublicUser(user);
}

// PATCH /users/me/password (Phase 8D). InvalidCredentialsError (not a dedicated code) reuses the
// same generic 401 the login path already returns for a wrong password -- this isn't the
// enumeration-safety scenario that shape was originally built for (the caller is already
// authenticated, so there's no email to enumerate), but it's still the right error for "the
// password you supplied is wrong," so reusing it beats inventing a parallel code for the same
// meaning. Revokes every session afterward, same "treat every existing session as suspect"
// behavior passwordReset.service.js's confirmReset() already applies -- a password change while
// logged in is an equally reasonable trigger, not a lesser one.
async function changePassword(id, { currentPassword, newPassword }) {
  const user = await userRepository.findById(id);
  if (!user) throw new NotFoundError("User not found.");

  const isValid = await verifyPassword(user.password_hash, currentPassword);
  if (!isValid) throw new InvalidCredentialsError();

  const passwordHash = await hashPassword(newPassword);
  await userRepository.updatePasswordHash(id, passwordHash);
  await refreshTokenService.revokeAllForUser(id);
}

// GET /admin/users (Phase 7C.1).
async function list({ search, role, page, limit }) {
  const { users, total } = await userRepository.findAll({ search, role, page, limit });
  return { users: users.map(toPublicUser), pagination: { page, limit, total } };
}

// PATCH /admin/users/:userId/deactivate (Phase 7C.1). Also revokes every existing session for
// that user -- a deactivated account should be logged out immediately, not just blocked from
// logging back in (auth.service.js's login() is what blocks the latter).
async function deactivateUser(id, deactivatedByAdminId) {
  const user = await userRepository.deactivate(id);
  if (!user) throw new NotFoundError("User not found.");

  await refreshTokenService.revokeAllForUser(id);
  await auditLogService.record({
    userId: deactivatedByAdminId,
    action: "user.deactivated",
    resourceType: "User",
    resourceId: id,
    metadata: { deactivatedUserId: id },
  });

  return toPublicUser(user);
}

// POST /admin/users (Phase 7C.1) -- the admin-UI equivalent of scripts/create-admin.js, scoped to
// instructor accounts only (the route/validator enforce this; admin account creation stays a
// CLI-only action, a deliberately smaller blast radius for the one action that grants
// platform-wide access). Mirrors create-admin.js's own pattern (generated password, shown once;
// its own audit-log entry) rather than sharing code with it -- the two entry points are different
// enough (this one has a real caller identity to record, the script doesn't) that duplicating a
// few lines is simpler than threading a shared helper through both.
async function createInstructor({ email, name }, createdByAdminId) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await userRepository.findByEmail(normalizedEmail);
  if (existing) {
    throw new EmailAlreadyRegisteredError();
  }

  const generatedPassword = crypto.randomBytes(18).toString("base64url");
  const passwordHash = await hashPassword(generatedPassword);
  const user = await userRepository.create({
    email: normalizedEmail,
    passwordHash,
    name,
    role: "instructor",
  });

  await auditLogService.record({
    userId: user.id,
    action: "user.instructor_created_via_admin_ui",
    resourceType: "User",
    resourceId: user.id,
    metadata: { createdByAdminId },
  });

  return { user: toPublicUser(user), generatedPassword };
}

// toPublicUser is deliberately not included here -- every caller (auth.service.js) imports the
// named export directly, so exposing it a second way via this object would just be dead surface.
export const userService = {
  getById,
  updateProfile,
  changePassword,
  list,
  deactivateUser,
  createInstructor,
};
