import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { adminService } from "../services/admin.service.js";
import { AdminUsersPage } from "./AdminUsersPage.jsx";

vi.mock("../services/admin.service.js", () => ({
  adminService: { listUsers: vi.fn(), createInstructor: vi.fn(), deactivateUser: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/users"]}>
      <Routes>
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("an admin sees the account list", async () => {
  adminService.listUsers.mockResolvedValue({
    users: [
      { id: "u1", name: "Ada Lovelace", email: "ada@example.com", role: "learner", deactivatedAt: null },
      {
        id: "u2",
        name: "Grace Hopper",
        email: "grace@example.com",
        role: "instructor",
        deactivatedAt: "2026-01-01T00:00:00Z",
      },
    ],
    pagination: { page: 1, limit: 20, total: 2 },
  });
  renderPage();

  expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  expect(screen.getByText("Deactivated")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
});

test("typing in the search box re-fetches with the search param", async () => {
  const user = userEvent.setup();
  adminService.listUsers.mockResolvedValue({
    users: [],
    pagination: { page: 1, limit: 20, total: 0 },
  });
  renderPage();

  await screen.findByText("No accounts match this search.");
  await user.type(screen.getByLabelText("Search"), "ada");

  await waitFor(() =>
    expect(adminService.listUsers).toHaveBeenLastCalledWith({
      search: "ada",
      role: undefined,
      page: 1,
      limit: 20,
    })
  );
});

test("creating an instructor shows the generated password once and clears the form", async () => {
  const user = userEvent.setup();
  adminService.listUsers.mockResolvedValue({
    users: [],
    pagination: { page: 1, limit: 20, total: 0 },
  });
  adminService.createInstructor.mockResolvedValue({
    user: { id: "u3", email: "new@example.com", role: "instructor" },
    generatedPassword: "one-time-secret-123",
  });
  renderPage();

  await screen.findByText("No accounts match this search.");
  await user.type(screen.getByLabelText("Name"), "New Instructor");
  await user.type(screen.getByLabelText("Email"), "new@example.com");
  await user.click(screen.getByRole("button", { name: "Create instructor account" }));

  expect(await screen.findByRole("status")).toHaveTextContent("one-time-secret-123");
  expect(screen.getByLabelText("Name")).toHaveValue("");
  expect(screen.getByLabelText("Email")).toHaveValue("");
});

test("shows an error banner when instructor creation fails, without clearing the form", async () => {
  const user = userEvent.setup();
  adminService.listUsers.mockResolvedValue({
    users: [],
    pagination: { page: 1, limit: 20, total: 0 },
  });
  adminService.createInstructor.mockRejectedValue({
    response: {
      data: { error: { code: "EMAIL_ALREADY_REGISTERED", message: "Already registered." } },
    },
  });
  renderPage();

  await screen.findByText("No accounts match this search.");
  await user.type(screen.getByLabelText("Name"), "New Instructor");
  await user.type(screen.getByLabelText("Email"), "taken@example.com");
  await user.click(screen.getByRole("button", { name: "Create instructor account" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Already registered.");
  expect(screen.getByLabelText("Email")).toHaveValue("taken@example.com");
});

test("deactivating a user requires confirmation, then updates that row", async () => {
  const user = userEvent.setup();
  adminService.listUsers.mockResolvedValue({
    users: [
      { id: "u1", name: "Ada Lovelace", email: "ada@example.com", role: "learner", deactivatedAt: null },
    ],
    pagination: { page: 1, limit: 20, total: 1 },
  });
  adminService.deactivateUser.mockResolvedValue({
    id: "u1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "learner",
    deactivatedAt: "2026-08-09T00:00:00Z",
  });
  renderPage();

  await screen.findByText("Ada Lovelace");
  await user.click(screen.getByRole("button", { name: "Deactivate" }));

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("Ada Lovelace will be logged out immediately");

  await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));

  expect(adminService.deactivateUser).toHaveBeenCalledWith("u1");
  await waitFor(() => expect(screen.getByText("Deactivated")).toBeInTheDocument());
});
