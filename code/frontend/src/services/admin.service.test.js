import { test, expect, vi } from "vitest";
import { apiClient } from "./apiClient.js";
import { adminService } from "./admin.service.js";

vi.mock("./apiClient.js", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

test("listUsers fetches /admin/users with search/role/page/limit params", async () => {
  const body = { users: [{ id: "u1" }], pagination: { page: 1, limit: 20, total: 1 } };
  apiClient.get.mockResolvedValue({ data: body });
  const result = await adminService.listUsers({ search: "ada", role: "learner" });
  expect(apiClient.get).toHaveBeenCalledWith("/admin/users", {
    params: { search: "ada", role: "learner", page: 1, limit: 20 },
  });
  expect(result).toEqual(body);
});

test("createInstructor posts to /admin/users and returns { user, generatedPassword }", async () => {
  const body = { user: { id: "u2", role: "instructor" }, generatedPassword: "abc123" };
  apiClient.post.mockResolvedValue({ data: body });
  const result = await adminService.createInstructor({ email: "a@example.com", name: "A" });
  expect(apiClient.post).toHaveBeenCalledWith("/admin/users", {
    email: "a@example.com",
    name: "A",
  });
  expect(result).toEqual(body);
});

test("deactivateUser patches /admin/users/:id/deactivate and returns the updated user", async () => {
  apiClient.patch.mockResolvedValue({ data: { user: { id: "u1", deactivatedAt: "now" } } });
  const result = await adminService.deactivateUser("u1");
  expect(apiClient.patch).toHaveBeenCalledWith("/admin/users/u1/deactivate");
  expect(result).toEqual({ id: "u1", deactivatedAt: "now" });
});

test("reactivateUser patches /admin/users/:id/reactivate and returns the updated user", async () => {
  apiClient.patch.mockResolvedValue({ data: { user: { id: "u1", deactivatedAt: null } } });
  const result = await adminService.reactivateUser("u1");
  expect(apiClient.patch).toHaveBeenCalledWith("/admin/users/u1/reactivate");
  expect(result).toEqual({ id: "u1", deactivatedAt: null });
});

test("changeUserRole patches /admin/users/:id/role with the new role and returns the updated user", async () => {
  apiClient.patch.mockResolvedValue({ data: { user: { id: "u1", role: "instructor" } } });
  const result = await adminService.changeUserRole("u1", "instructor");
  expect(apiClient.patch).toHaveBeenCalledWith("/admin/users/u1/role", { role: "instructor" });
  expect(result).toEqual({ id: "u1", role: "instructor" });
});
