import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { passwordResetService } from "../services/passwordReset.service.js";
import { ResetPasswordPage } from "./ResetPasswordPage.jsx";

vi.mock("../services/passwordReset.service.js", () => ({
  passwordResetService: { requestReset: vi.fn(), confirmReset: vi.fn() },
}));

function renderPage(searchParams = "?token=abc123") {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${searchParams}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/forgot-password" element={<div>Forgot password page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("submitting a valid new password confirms the reset and redirects to /login", async () => {
  const user = userEvent.setup();
  passwordResetService.confirmReset.mockResolvedValue();
  renderPage();

  await user.type(screen.getByLabelText("New password"), "brand-new-password");
  await user.click(screen.getByRole("button", { name: "Reset password" }));

  await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());
  expect(passwordResetService.confirmReset).toHaveBeenCalledWith({
    token: "abc123",
    newPassword: "brand-new-password",
  });
});

test("rejects a too-short password before calling the service", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.type(screen.getByLabelText("New password"), "short");
  await user.click(screen.getByRole("button", { name: "Reset password" }));

  expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
  expect(passwordResetService.confirmReset).not.toHaveBeenCalled();
});

test("shows an error banner and a link to request a new one when the token is invalid or expired", async () => {
  const user = userEvent.setup();
  passwordResetService.confirmReset.mockRejectedValue({
    response: {
      data: {
        error: {
          code: "INVALID_OR_EXPIRED_TOKEN",
          message: "This link is invalid or has expired. Please request a new one.",
        },
      },
    },
  });
  renderPage();

  await user.type(screen.getByLabelText("New password"), "brand-new-password");
  await user.click(screen.getByRole("button", { name: "Reset password" }));

  const banner = await screen.findByRole("alert");
  expect(banner).toHaveTextContent("This link is invalid or has expired.");
  expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
    "href",
    "/forgot-password"
  );
});

test("with no token in the URL, shows a message instead of the form", () => {
  renderPage("");

  expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
    "href",
    "/forgot-password"
  );
});
