-- Phase 7B.1 (password reset). Modeled directly on refresh_token (migrations/002): a hashed,
-- single-use, expiring token row -- reusing that shape rather than inventing a new one.
-- user_id CASCADEs for the same reason as refresh_token: a reset row has no historical value once
-- its owning user is gone.
CREATE TABLE password_reset_token (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_token_user_id ON password_reset_token (user_id);
