import { apiClient } from "./apiClient.js";

async function requestReset(email) {
  await apiClient.post("/auth/password-reset/request", { email });
}

async function confirmReset({ token, newPassword }) {
  await apiClient.post("/auth/password-reset/confirm", { token, newPassword });
}

export const passwordResetService = { requestReset, confirmReset };
