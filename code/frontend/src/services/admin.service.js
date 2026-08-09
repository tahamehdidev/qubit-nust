import { apiClient } from "./apiClient.js";

async function listUsers({ search, role, page = 1, limit = 20 } = {}) {
  const { data } = await apiClient.get("/admin/users", { params: { search, role, page, limit } });
  return data; // { users, pagination }
}

async function createInstructor({ email, name }) {
  const { data } = await apiClient.post("/admin/users", { email, name });
  return data; // { user, generatedPassword } -- shown once, never retrievable again
}

async function deactivateUser(userId) {
  const { data } = await apiClient.patch(`/admin/users/${userId}/deactivate`);
  return data.user;
}

export const adminService = { listUsers, createInstructor, deactivateUser };
