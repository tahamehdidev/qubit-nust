import { test, expect, vi } from "vitest";
import { apiClient } from "./apiClient.js";
import { passwordResetService } from "./passwordReset.service.js";

vi.mock("./apiClient.js", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

test("requestReset posts to /auth/password-reset/request with the email", async () => {
  apiClient.post.mockResolvedValue({});
  await passwordResetService.requestReset("a@example.com");
  expect(apiClient.post).toHaveBeenCalledWith("/auth/password-reset/request", {
    email: "a@example.com",
  });
});

test("confirmReset posts to /auth/password-reset/confirm with the token and new password", async () => {
  apiClient.post.mockResolvedValue({});
  await passwordResetService.confirmReset({ token: "abc123", newPassword: "new-password-1" });
  expect(apiClient.post).toHaveBeenCalledWith("/auth/password-reset/confirm", {
    token: "abc123",
    newPassword: "new-password-1",
  });
});
