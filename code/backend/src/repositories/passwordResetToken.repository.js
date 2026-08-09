import { pool } from "../config/db.js";

async function create({ userId, tokenHash, expiresAt }) {
  const result = await pool.query(
    "INSERT INTO password_reset_token (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING *",
    [userId, tokenHash, expiresAt]
  );
  return result.rows[0];
}

// Atomic conditional update, same reasoning as refresh_token's revokeIfActiveByHash: only one of
// two simultaneous confirm attempts against the same token can win the race. Returns the row
// (including user_id) on success so the caller doesn't need a separate lookup; null if the token
// never existed, was already used, or is expired -- all three collapse to the same
// InvalidOrExpiredTokenError at the service layer.
async function markUsedIfActiveByHash(tokenHash) {
  const result = await pool.query(
    "UPDATE password_reset_token SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING *",
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export const passwordResetTokenRepository = { create, markUsedIfActiveByHash };
