import { userRepository } from "../repositories/user.repository.js";
import { passwordResetTokenRepository } from "../repositories/passwordResetToken.repository.js";
import { refreshTokenService } from "./refreshToken.service.js";
import { hashPassword } from "../utils/hash.js";
import { generateRefreshToken, hashToken } from "../utils/token.js";
import { normalizeEmail } from "../utils/normalizeEmail.js";
import { sendPasswordResetEmail } from "../utils/email.js";
import { env } from "../config/env.js";
import { InvalidOrExpiredTokenError } from "../errors/index.js";

const RESET_TOKEN_TTL_MINUTES = 30;

function addMinutes(date, minutes) {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

// Enumeration-safety discipline (03-security-architecture.md's dummy-hash login precedent,
// applied here): resolves identically whether or not the email belongs to a real account. A
// nonexistent email is a silent no-op -- no token created, no email sent, no error thrown.
async function requestReset(email) {
  const normalizedEmail = normalizeEmail(email);
  const user = await userRepository.findByEmail(normalizedEmail);
  if (!user) return;

  const rawToken = generateRefreshToken();
  await passwordResetTokenRepository.create({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt: addMinutes(new Date(), RESET_TOKEN_TTL_MINUTES),
  });

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail({ to: user.email, resetUrl });
}

async function confirmReset({ token, newPassword }) {
  const tokenHash = hashToken(token);
  const resetToken = await passwordResetTokenRepository.markUsedIfActiveByHash(tokenHash);
  if (!resetToken) {
    throw new InvalidOrExpiredTokenError();
  }

  const passwordHash = await hashPassword(newPassword);
  await userRepository.updatePasswordHash(resetToken.user_id, passwordHash);

  // A password reset is a reasonable signal to treat every existing session as suspect --
  // same "log out everywhere" behavior logout-all already offers deliberately, not incidentally.
  await refreshTokenService.revokeAllForUser(resetToken.user_id);
}

export const passwordResetService = { requestReset, confirmReset };
