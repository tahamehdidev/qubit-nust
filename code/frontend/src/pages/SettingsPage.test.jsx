import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { userService } from "../services/user.service.js";
import { SettingsPage } from "./SettingsPage.jsx";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../services/user.service.js", () => ({
  userService: { updateMe: vi.fn(), changePassword: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("prefills the name field with the caller's current name", () => {
  useAuth.mockReturnValue({
    user: { id: "u1", name: "Ada Lovelace" },
    updateUser: vi.fn(),
    clearSession: vi.fn(),
  });
  renderPage();
  expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
});

test("saving a new name calls updateMe, updates the auth context, and shows a confirmation", async () => {
  const user = userEvent.setup();
  const updateUser = vi.fn();
  useAuth.mockReturnValue({
    user: { id: "u1", name: "Ada Lovelace" },
    updateUser,
    clearSession: vi.fn(),
  });
  userService.updateMe.mockResolvedValue({ id: "u1", name: "Ada Byron" });
  renderPage();

  const nameInput = screen.getByLabelText("Name");
  await user.clear(nameInput);
  await user.type(nameInput, "Ada Byron");
  await user.click(screen.getByRole("button", { name: "Save name" }));

  expect(userService.updateMe).toHaveBeenCalledWith({ name: "Ada Byron" });
  expect(updateUser).toHaveBeenCalledWith({ name: "Ada Byron" });
  expect(await screen.findByText("Name updated.")).toBeInTheDocument();
});

test("changing password with a short new password shows a field error and doesn't call the service", async () => {
  const user = userEvent.setup();
  useAuth.mockReturnValue({
    user: { id: "u1", name: "Ada Lovelace" },
    updateUser: vi.fn(),
    clearSession: vi.fn(),
  });
  renderPage();

  await user.type(screen.getByLabelText("Current password"), "old-password123");
  await user.type(screen.getByLabelText("New password"), "short");
  await user.click(screen.getByRole("button", { name: "Change password" }));

  expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
  expect(userService.changePassword).not.toHaveBeenCalled();
});

test("changing password successfully clears the session and redirects to /login with a banner flag", async () => {
  const user = userEvent.setup();
  const clearSession = vi.fn();
  useAuth.mockReturnValue({
    user: { id: "u1", name: "Ada Lovelace" },
    updateUser: vi.fn(),
    clearSession,
  });
  userService.changePassword.mockResolvedValue(undefined);
  renderPage();

  await user.type(screen.getByLabelText("Current password"), "old-password123");
  await user.type(screen.getByLabelText("New password"), "brand-new-password123");
  await user.click(screen.getByRole("button", { name: "Change password" }));

  expect(userService.changePassword).toHaveBeenCalledWith({
    currentPassword: "old-password123",
    newPassword: "brand-new-password123",
  });
  expect(await screen.findByText("Login page")).toBeInTheDocument();
  expect(clearSession).toHaveBeenCalled();
});

test("a wrong current password shows the backend's error without navigating away", async () => {
  const user = userEvent.setup();
  useAuth.mockReturnValue({
    user: { id: "u1", name: "Ada Lovelace" },
    updateUser: vi.fn(),
    clearSession: vi.fn(),
  });
  userService.changePassword.mockRejectedValue({
    response: { data: { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } } },
  });
  renderPage();

  await user.type(screen.getByLabelText("Current password"), "wrong-password");
  await user.type(screen.getByLabelText("New password"), "brand-new-password123");
  await user.click(screen.getByRole("button", { name: "Change password" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  expect(screen.queryByText("Login page")).not.toBeInTheDocument();
});
