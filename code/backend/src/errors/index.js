// One subclass per error code defined in 02-api-contract.md §0.3. `throw new SomeError(...)` from
// wherever the problem is detected -- errorHandler.middleware.js is the only place these get
// translated into a response, so adding a new case never requires touching that plumbing.
import { AppError } from "./AppError.js";

export class ValidationError extends AppError {
  constructor(message, field = null) {
    super("VALIDATION_ERROR", message, 400, field);
  }
}

export class EmailAlreadyRegisteredError extends AppError {
  constructor(message = "An account with this email already exists.") {
    super("EMAIL_ALREADY_REGISTERED", message, 409, "email");
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = "Invalid email or password.") {
    super("INVALID_CREDENTIALS", message, 401);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Not authenticated.") {
    super("UNAUTHENTICATED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found.") {
    super("NOT_FOUND", message, 404);
  }
}

export class InvalidRoleForActionError extends AppError {
  constructor(message, field = null) {
    super("INVALID_ROLE_FOR_ACTION", message, 400, field);
  }
}

export class ContextMismatchError extends AppError {
  constructor(message = "Question is not attached to the given context.") {
    super("CONTEXT_MISMATCH", message, 422);
  }
}

export class DuplicateResourceError extends AppError {
  constructor(message, field = null) {
    super("DUPLICATE_RESOURCE", message, 409, field);
  }
}

export class ReorderSetMismatchError extends AppError {
  constructor(message = "The submitted set of IDs does not match the actual current siblings.") {
    super("REORDER_SET_MISMATCH", message, 400);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests. Please try again later.") {
    super("RATE_LIMITED", message, 429);
  }
}

export class InvalidOrExpiredTokenError extends AppError {
  constructor(message = "This link is invalid or has expired. Please request a new one.") {
    super("INVALID_OR_EXPIRED_TOKEN", message, 400);
  }
}

export { AppError };
