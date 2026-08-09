import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AppError,
  ValidationError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  InvalidRoleForActionError,
  ContextMismatchError,
  DuplicateResourceError,
  ReorderSetMismatchError,
  RateLimitedError,
  InvalidOrExpiredTokenError,
  AccountDeactivatedError,
} from "../../src/errors/index.js";

test("AppError base class carries code/message/statusCode/field", () => {
  const err = new AppError("SOME_CODE", "Something broke", 418, "someField");
  assert.equal(err.code, "SOME_CODE");
  assert.equal(err.message, "Something broke");
  assert.equal(err.statusCode, 418);
  assert.equal(err.field, "someField");
  assert.ok(err instanceof Error);
});

test("each subclass sets the right code and status per 02-api-contract.md §0.3", () => {
  const cases = [
    [new ValidationError("bad input", "email"), "VALIDATION_ERROR", 400, "email"],
    [new EmailAlreadyRegisteredError(), "EMAIL_ALREADY_REGISTERED", 409, "email"],
    [new InvalidCredentialsError(), "INVALID_CREDENTIALS", 401, null],
    [new UnauthenticatedError(), "UNAUTHENTICATED", 401, null],
    [new ForbiddenError(), "FORBIDDEN", 403, null],
    [new NotFoundError(), "NOT_FOUND", 404, null],
    [new InvalidRoleForActionError("not a learner"), "INVALID_ROLE_FOR_ACTION", 400, null],
    [new ContextMismatchError(), "CONTEXT_MISMATCH", 422, null],
    [new DuplicateResourceError("already attached"), "DUPLICATE_RESOURCE", 409, null],
    [new ReorderSetMismatchError(), "REORDER_SET_MISMATCH", 400, null],
    [new RateLimitedError(), "RATE_LIMITED", 429, null],
    [new InvalidOrExpiredTokenError(), "INVALID_OR_EXPIRED_TOKEN", 400, null],
    [new AccountDeactivatedError(), "ACCOUNT_DEACTIVATED", 403, null],
  ];

  for (const [err, code, statusCode, field] of cases) {
    assert.ok(err instanceof AppError, `${code} should be an AppError`);
    assert.equal(err.code, code);
    assert.equal(err.statusCode, statusCode);
    assert.equal(err.field, field);
  }
});
