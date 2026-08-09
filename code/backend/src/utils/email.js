import { env } from "../config/env.js";

// Phase 7B.1: mirrors utils/sentry.js's DSN-optional pattern -- a genuine no-op (log only) until
// a real RESEND_API_KEY is supplied, so this ships now without requiring a Resend account to
// exist yet. Uses Resend's REST API directly via the platform's global fetch rather than adding
// the "resend" SDK as a dependency -- one JSON POST doesn't need a wrapper library.
export async function sendPasswordResetEmail({ to, resetUrl }) {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:noop] Password reset link for ${to}: ${resetUrl}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject: "Reset your Qubit — NUST password",
      html: `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">Click here to choose a new password</a>. This link expires in 30 minutes.</p><p>If you didn't request this, you can safely ignore this email.</p>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error (${response.status}): ${body}`);
  }
}
