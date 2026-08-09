import { apiClient } from "./apiClient.js";

// Always the caller's own cohorts (02-api-contract.md §6.2) -- instructor-only, no admin variant
// documented for this route, so there's no userId-style param to accept here.
async function list() {
  const { data } = await apiClient.get("/cohorts", { params: { instructorId: "me" } });
  return data; // { cohorts, pagination }
}

async function getById(cohortId) {
  const { data } = await apiClient.get(`/cohorts/${cohortId}`);
  return data.cohort;
}

// instructorId is admin-only in practice (§6.1) -- an instructor's own instructorId, if sent,
// is silently ignored server-side, not rejected here.
async function create({ name, instructorId }) {
  const { data } = await apiClient.post("/cohorts", { name, instructorId });
  return data.cohort;
}

async function update(cohortId, { name, instructorId }) {
  const { data } = await apiClient.patch(`/cohorts/${cohortId}`, { name, instructorId });
  return data.cohort;
}

async function remove(cohortId) {
  await apiClient.delete(`/cohorts/${cohortId}`);
}

async function listStudents(cohortId) {
  const { data } = await apiClient.get(`/cohorts/${cohortId}/students`);
  return data; // { students, pagination }
}

async function enrollStudent(cohortId, { userId }) {
  const { data } = await apiClient.post(`/cohorts/${cohortId}/students`, { userId });
  return data.enrollment;
}

// PATCH, not DELETE (02-api-contract.md §6.1) -- marks the enrollment removed, doesn't delete it.
async function removeStudent(cohortId, userId) {
  const { data } = await apiClient.patch(`/cohorts/${cohortId}/students/${userId}`);
  return data.enrollment;
}

// Phase 7B.2's primary self-enrollment path -- the caller is always the logged-in learner
// themselves, so there's no userId parameter here (unlike enrollStudent, which is instructor-driven).
async function join(joinCode) {
  const { data } = await apiClient.post("/cohorts/join", { joinCode });
  return data; // { enrollment, cohort: { id, name } }
}

async function regenerateJoinCode(cohortId) {
  const { data } = await apiClient.patch(`/cohorts/${cohortId}`, { regenerateJoinCode: true });
  return data.cohort;
}

async function bulkEnrollStudents(cohortId, emails) {
  const { data } = await apiClient.post(`/cohorts/${cohortId}/students/bulk`, { emails });
  return data.results;
}

export const cohortService = {
  list,
  getById,
  create,
  update,
  remove,
  listStudents,
  enrollStudent,
  removeStudent,
  join,
  regenerateJoinCode,
  bulkEnrollStudents,
};
