import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const NODE_ENV = process.env.NODE_ENV ?? "development";
const isTest = NODE_ENV === "test";

// DATABASE_URL resolves to TEST_DATABASE_URL under NODE_ENV=test -- callers (config/db.js and
// everything downstream) never need to know which environment they're in; they just read
// env.DATABASE_URL. See backend/.env.example for how these map to the two Postgres roles
// (app_user for the app, the bootstrap role for migrations only).
export const env = {
  NODE_ENV,
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: required(isTest ? "TEST_DATABASE_URL" : "DATABASE_URL"),
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  FRONTEND_URL: required("FRONTEND_URL"),
  // Optional (Phase 5 Polish) -- unset in dev/test/CI, so Sentry stays a genuine no-op until a
  // real project's DSN is supplied. Not `required()`: this must never block the app from starting.
  SENTRY_DSN: process.env.SENTRY_DSN ?? null,
  // Optional (Phase 7B.1) -- same reasoning as SENTRY_DSN. Unset in dev/test/CI: utils/email.js
  // logs the reset link instead of sending a real email until a real Resend API key is supplied.
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? null,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL ?? "Qubit — NUST <onboarding@resend.dev>",
};
