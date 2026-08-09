import { test } from "node:test";
import assert from "node:assert/strict";
import { generateJoinCode, normalizeJoinCode } from "../../src/utils/joinCode.js";

test("generateJoinCode produces distinct 8-character codes drawn from the safe alphabet", () => {
  const a = generateJoinCode();
  const b = generateJoinCode();
  assert.notEqual(a, b);
  assert.equal(a.length, 8);
  assert.match(a, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
});

test("normalizeJoinCode trims whitespace and uppercases", () => {
  assert.equal(normalizeJoinCode(" abc123de "), "ABC123DE");
  assert.equal(normalizeJoinCode("ABC123DE"), "ABC123DE");
});

test("normalizeJoinCode is idempotent", () => {
  const once = normalizeJoinCode(" abc123de ");
  assert.equal(normalizeJoinCode(once), once);
});
