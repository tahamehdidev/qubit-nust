import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { passwordResetService } from "../services/passwordReset.service.js";
import { ForgotPasswordPage } from "./ForgotPasswordPage.jsx";

vi.mock("../services/passwordReset.service.js", () => ({
  passwordResetService: { requestReset: vi.fn(), confirmReset: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/forgot-password"]}>
      <ForgotPasswordPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("submitting a valid email shows the identical confirmation message regardless of account existence", async () => {
  const user = userEvent.setup();
  passwordResetService.requestReset.mockResolvedValue();
  renderPage();

  await user.type(screen.getByLabelText("Your email"), "ada@example.com");
  await user.click(screen.getByRole("button", { name: "Send reset link" }));

  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "If an account exists for ada@example.com, we’ve sent a link to reset your password."
    )
  );
  expect(passwordResetService.requestReset).toHaveBeenCalledWith("ada@example.com");
});

test("the form is replaced by the confirmation, not shown alongside it", async () => {
  const user = userEvent.setup();
  passwordResetService.requestReset.mockResolvedValue();
  renderPage();

  await user.type(screen.getByLabelText("Your email"), "ada@example.com");
  await user.click(screen.getByRole("button", { name: "Send reset link" }));

  await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  expect(screen.queryByLabelText("Your email")).not.toBeInTheDocument();
});

test("shows an error banner and keeps the form when the request fails unexpectedly", async () => {
  const user = userEvent.setup();
  passwordResetService.requestReset.mockRejectedValue({
    response: { data: { error: { code: "RATE_LIMITED", message: "Too many requests." } } },
  });
  renderPage();

  await user.type(screen.getByLabelText("Your email"), "ada@example.com");
  await user.click(screen.getByRole("button", { name: "Send reset link" }));

  const banner = await screen.findByRole("alert");
  expect(banner).toHaveTextContent("Too many requests.");
  expect(screen.getByLabelText("Your email")).toBeInTheDocument();
});
