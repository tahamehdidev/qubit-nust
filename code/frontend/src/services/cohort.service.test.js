import { test, expect, vi } from "vitest";
import { apiClient } from "./apiClient.js";
import { cohortService } from "./cohort.service.js";

vi.mock("./apiClient.js", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

test("list fetches /cohorts?instructorId=me and returns the full body", async () => {
  const body = { cohorts: [{ id: 1 }], pagination: { page: 1, limit: 1, total: 1 } };
  apiClient.get.mockResolvedValue({ data: body });
  const result = await cohortService.list();
  expect(apiClient.get).toHaveBeenCalledWith("/cohorts", { params: { instructorId: "me" } });
  expect(result).toEqual(body);
});

test("getById fetches /cohorts/:id and returns the cohort", async () => {
  apiClient.get.mockResolvedValue({ data: { cohort: { id: 2, name: "Cohort" } } });
  const result = await cohortService.getById(2);
  expect(apiClient.get).toHaveBeenCalledWith("/cohorts/2");
  expect(result).toEqual({ id: 2, name: "Cohort" });
});

test("create posts to /cohorts and returns the created cohort", async () => {
  apiClient.post.mockResolvedValue({ data: { cohort: { id: 3, name: "New" } } });
  const result = await cohortService.create({ name: "New", instructorId: undefined });
  expect(apiClient.post).toHaveBeenCalledWith("/cohorts", {
    name: "New",
    instructorId: undefined,
  });
  expect(result).toEqual({ id: 3, name: "New" });
});

test("update patches /cohorts/:id and returns the updated cohort", async () => {
  apiClient.patch.mockResolvedValue({ data: { cohort: { id: 2, name: "Renamed" } } });
  const result = await cohortService.update(2, { name: "Renamed" });
  expect(apiClient.patch).toHaveBeenCalledWith("/cohorts/2", {
    name: "Renamed",
    instructorId: undefined,
  });
  expect(result).toEqual({ id: 2, name: "Renamed" });
});

test("remove deletes /cohorts/:id", async () => {
  apiClient.delete.mockResolvedValue({});
  await cohortService.remove(2);
  expect(apiClient.delete).toHaveBeenCalledWith("/cohorts/2");
});

test("listStudents fetches /cohorts/:id/students and returns the full body", async () => {
  const body = { students: [{ id: 1 }], pagination: { page: 1, limit: 1, total: 1 } };
  apiClient.get.mockResolvedValue({ data: body });
  const result = await cohortService.listStudents(2);
  expect(apiClient.get).toHaveBeenCalledWith("/cohorts/2/students");
  expect(result).toEqual(body);
});

test("enrollStudent posts to /cohorts/:id/students and returns the enrollment", async () => {
  apiClient.post.mockResolvedValue({ data: { enrollment: { id: 9, status: "active" } } });
  const result = await cohortService.enrollStudent(2, { userId: "u1" });
  expect(apiClient.post).toHaveBeenCalledWith("/cohorts/2/students", { userId: "u1" });
  expect(result).toEqual({ id: 9, status: "active" });
});

test("removeStudent patches /cohorts/:id/students/:userId with no body and returns the enrollment", async () => {
  apiClient.patch.mockResolvedValue({ data: { enrollment: { id: 9, status: "removed" } } });
  const result = await cohortService.removeStudent(2, "u1");
  expect(apiClient.patch).toHaveBeenCalledWith("/cohorts/2/students/u1");
  expect(result).toEqual({ id: 9, status: "removed" });
});

test("join posts to /cohorts/join and returns { enrollment, cohort }", async () => {
  const body = { enrollment: { id: 9 }, cohort: { id: 2, name: "Cohort" } };
  apiClient.post.mockResolvedValue({ data: body });
  const result = await cohortService.join("ABC123DE");
  expect(apiClient.post).toHaveBeenCalledWith("/cohorts/join", { joinCode: "ABC123DE" });
  expect(result).toEqual(body);
});

test("regenerateJoinCode patches /cohorts/:id with regenerateJoinCode:true and returns the cohort", async () => {
  apiClient.patch.mockResolvedValue({ data: { cohort: { id: 2, join_code: "NEW12345" } } });
  const result = await cohortService.regenerateJoinCode(2);
  expect(apiClient.patch).toHaveBeenCalledWith("/cohorts/2", { regenerateJoinCode: true });
  expect(result).toEqual({ id: 2, join_code: "NEW12345" });
});

test("bulkEnrollStudents posts to /cohorts/:id/students/bulk and returns the per-row results", async () => {
  const results = [{ email: "a@example.com", status: "enrolled" }];
  apiClient.post.mockResolvedValue({ data: { results } });
  const result = await cohortService.bulkEnrollStudents(2, ["a@example.com"]);
  expect(apiClient.post).toHaveBeenCalledWith("/cohorts/2/students/bulk", {
    emails: ["a@example.com"],
  });
  expect(result).toEqual(results);
});

test("listMine fetches /cohorts/mine and returns the cohorts array", async () => {
  const cohorts = [{ id: 1, cohort_id: 2, cohort_name: "Quantum 101" }];
  apiClient.get.mockResolvedValue({ data: { cohorts } });
  const result = await cohortService.listMine();
  expect(apiClient.get).toHaveBeenCalledWith("/cohorts/mine");
  expect(result).toEqual(cohorts);
});

test("leave patches /cohorts/:id/students/me with no body and returns the enrollment", async () => {
  apiClient.patch.mockResolvedValue({ data: { enrollment: { id: 9, status: "removed" } } });
  const result = await cohortService.leave(2);
  expect(apiClient.patch).toHaveBeenCalledWith("/cohorts/2/students/me");
  expect(result).toEqual({ id: 9, status: "removed" });
});

test("listAll fetches /cohorts with no params and returns the full body", async () => {
  const body = {
    cohorts: [{ id: 1, instructor_name: "Ada" }],
    pagination: { page: 1, limit: 1, total: 1 },
  };
  apiClient.get.mockResolvedValue({ data: body });
  const result = await cohortService.listAll();
  expect(apiClient.get).toHaveBeenCalledWith("/cohorts");
  expect(result).toEqual(body);
});
