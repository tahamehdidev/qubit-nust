import { apiClient } from "./apiClient.js";

// The caller's own cohorts, for an instructor (02-api-contract.md §6.2) -- the instructorId=me
// param is vestigial (the backend always derives "own" from the authenticated session, never the
// query string) but left as-is rather than churned for its own sake. Use listAll() instead for
// the admin-facing platform-wide view (Phase 8C) -- same endpoint, but that name would be
// actively misleading applied to an admin call.
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

// Phase 8D: the read side of join() a learner otherwise never sees again.
async function listMine() {
  const { data } = await apiClient.get("/cohorts/mine");
  return data.cohorts;
}

// Self-service leave -- distinct from removeStudent, which is instructor/admin-driven and takes
// a target userId; this always acts on the caller.
async function leave(cohortId) {
  const { data } = await apiClient.patch(`/cohorts/${cohortId}/students/me`);
  return data.enrollment;
}

// Admin-only, platform-wide (Phase 8C) -- an admin previously had no way to see any cohort it
// didn't already know the numeric id of. Same GET /cohorts endpoint as list(), which branches
// server-side on the caller's role; no query param needed here since "own cohorts" doesn't apply
// to an admin account.
async function listAll() {
  const { data } = await apiClient.get("/cohorts");
  return data; // { cohorts, pagination }
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
  listMine,
  leave,
  listAll,
};
