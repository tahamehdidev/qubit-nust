import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext.jsx";
import { authService } from "../services/auth.service.js";
import { LoginPage } from "./LoginPage.jsx";

vi.mock("../services/auth.service.js", () => ({
  authService: {
    signup: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    refresh: vi.fn(),
  },
}));
vi.mock("../services/user.service.js", () => ({
  userService: { getMe: vi.fn() },
}));
vi.mock("../services/apiClient.js", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  configureAuth: vi.fn(),
}));

function renderLoginPage({ initialEntries = ["/login"] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/courses" element={<div>Course catalog</div>} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authService.refresh.mockRejectedValue(new Error("no session"));
});

test("submitting valid credentials as a learner logs in and redirects to /dashboard by default", async () => {
  const user = userEvent.setup();
  authService.login.mockResolvedValue({
    user: { id: "u1", name: "Ada", role: "learner" },
    accessToken: "token",
  });
  renderLoginPage();

  await user.type(screen.getByLabelText("Your email"), "ada@example.com");
  await user.type(screen.getByLabelText("Your password"), "correct-password");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  await waitFor(() => expect(screen.getByText("Dashboard")).toBeInTheDocument());
  expect(authService.login).toHaveBeenCalledWith({
    email: "ada@example.com",
    password: "correct-password",
  });
});

test("submitting valid credentials as an instructor logs in and redirects to /courses by default", async () => {
  const user = userEvent.setup();
  authService.login.mockResolvedValue({
    user: { id: "u2", name: "Dr. Feynman", role: "instructor" },
    accessToken: "token",
  });
  renderLoginPage();

  await user.type(screen.getByLabelText("Your email"), "feynman@example.com");
  await user.type(screen.getByLabelText("Your password"), "correct-password");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  await waitFor(() => expect(screen.getByText("Course catalog")).toBeInTheDocument());
});

test("redirects back to the page ProtectedRoute bounced the visitor from", async () => {
  const user = userEvent.setup();
  authService.login.mockResolvedValue({
    user: { id: "u1", name: "Ada", role: "learner" },
    accessToken: "token",
  });

  render(
    <MemoryRouter
      initialEntries={[{ pathname: "/login", state: { from: { pathname: "/dashboard" } } }]}
    >
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );

  await user.type(screen.getByLabelText("Your email"), "ada@example.com");
  await user.type(screen.getByLabelText("Your password"), "correct-password");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  await waitFor(() => expect(screen.getByText("Dashboard")).toBeInTheDocument());
});

test("wrong password and a nonexistent email render the exact same message", async () => {
  const user = userEvent.setup();
  const invalidCredentialsError = {
    response: { data: { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } } },
  };
  authService.login.mockRejectedValue(invalidCredentialsError);
  renderLoginPage();

  await user.type(screen.getByLabelText("Your email"), "nobody@example.com");
  await user.type(screen.getByLabelText("Your password"), "whatever");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  const banner = await screen.findByRole("alert");
  expect(banner).toHaveTextContent("Invalid email or password.");
  // Nothing in the rendered output should hint at which case it was.
  expect(screen.queryByText(/no account/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/wrong password/i)).not.toBeInTheDocument();
});

test("shows a success banner after being redirected here from a completed signup", () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state: { justSignedUp: true } }]}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );

  expect(screen.getByText("Account created. Log in to continue.")).toBeInTheDocument();
});

test("shows a success banner after being redirected here from a completed password reset", () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state: { justResetPassword: true } }]}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );

  expect(screen.getByText("Password reset. Log in with your new password.")).toBeInTheDocument();
});

test("shows a success banner after being redirected here from a self-service password change", () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state: { justChangedPassword: true } }]}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );

  expect(
    screen.getByText(
      "Password changed. You’ve been logged out everywhere — log in with your new password."
    )
  ).toBeInTheDocument();
});

test("links to /forgot-password", () => {
  renderLoginPage();
  expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
    "href",
    "/forgot-password"
  );
});

test("disables the form and shows a loading submit button while the request is in flight", async () => {
  const user = userEvent.setup();
  let resolveLogin;
  authService.login.mockReturnValue(
    new Promise((resolve) => {
      resolveLogin = resolve;
    })
  );
  renderLoginPage();

  await user.type(screen.getByLabelText("Your email"), "ada@example.com");
  await user.type(screen.getByLabelText("Your password"), "correct-password");
  await user.click(screen.getByRole("button", { name: "Log in" }));

  expect(screen.getByLabelText("Your email")).toBeDisabled();
  expect(screen.getByLabelText("Your password")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Log in" })).toHaveAttribute("aria-busy", "true");

  resolveLogin({ user: { id: "u1", name: "Ada", role: "learner" }, accessToken: "token" });
  await waitFor(() => expect(screen.getByText("Dashboard")).toBeInTheDocument());
});
