import { test, expect, vi } from "vitest";
import { apiClient } from "./apiClient.js";
import { userService } from "./user.service.js";

vi.mock("./apiClient.js", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

test("getMe fetches /users/me and returns the user", async () => {
  apiClient.get.mockResolvedValue({ data: { user: { id: "u1", name: "A" } } });
  const result = await userService.getMe();
  expect(apiClient.get).toHaveBeenCalledWith("/users/me");
  expect(result).toEqual({ id: "u1", name: "A" });
});

test("updateMe patches /users/me with the new name and returns the updated user", async () => {
  apiClient.patch.mockResolvedValue({ data: { user: { id: "u1", name: "B" } } });
  const result = await userService.updateMe({ name: "B" });
  expect(apiClient.patch).toHaveBeenCalledWith("/users/me", { name: "B" });
  expect(result).toEqual({ id: "u1", name: "B" });
});

test("changePassword patches /users/me/password with the current and new password", async () => {
  apiClient.patch.mockResolvedValue({ data: {} });
  await userService.changePassword({ currentPassword: "old-pw", newPassword: "new-pw" });
  expect(apiClient.patch).toHaveBeenCalledWith("/users/me/password", {
    currentPassword: "old-pw",
    newPassword: "new-pw",
  });
});
