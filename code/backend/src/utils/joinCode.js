import crypto from "node:crypto";

// Excludes 0/O and 1/I/L -- easy to misread or mistype when a learner is copying an 8-character
// code off a whiteboard or a shared screen. Not a security secret in the password/token sense (it
// exists to be shared), so a slightly smaller alphabet in exchange for fewer typos is the right
// tradeoff -- 32^8 (~1.1 trillion) combinations is still far more than this app will ever create.
const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const JOIN_CODE_LENGTH = 8;

export function generateJoinCode() {
  const bytes = crypto.randomBytes(JOIN_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[bytes[i] % JOIN_CODE_ALPHABET.length];
  }
  return code;
}

// One shared rule for comparing a learner-submitted code against a stored one -- same principle
// as normalizeEmail.js, so a code copied with stray whitespace or typed in lowercase still matches.
export function normalizeJoinCode(code) {
  return code.trim().toUpperCase();
}
