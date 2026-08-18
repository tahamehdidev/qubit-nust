import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext.jsx";
import { authService } from "../services/auth.service.js";
import { SignupPage } from "./SignupPage.jsx";

// Reads back the router state navigate() was called with -- AuthenticatedLayout's own test
// covers rendering the actual welcome toast from this same state shape in isolation.
function CourseCatalogStub() {
  const location = useLocation();
  return (
    <div>
      Course catalog
      {location.state?.welcomeName ? <span>welcomeName: {location.state.welcomeName}</span> : null}
    </div>
  );
}

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

function renderSignupPage() {
  return render(
    <MemoryRouter initialEntries={["/signup"]}>
      <AuthProvider>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/courses" element={<CourseCatalogStub />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function fillAndSubmit(
  user,
  { name = "Ada Lovelace", email = "ada@example.com", password = "password123" } = {}
) {
  await user.type(screen.getByLabelText("Your name"), name);
  await user.type(screen.getByLabelText("Your email"), email);
  await user.type(screen.getByLabelText("Create password"), password);
  await user.click(screen.getByRole("button", { name: "Create account" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  authService.refresh.mockRejectedValue(new Error("no session"));
});

test("shows a reassurance line about what happens after signup", () => {
  // Critique fix: every landing-page CTA routed here with zero reassurance at the highest-stakes
  // moment -- a bare Name/Email/Password form with no privacy note, no "what happens next."
  renderSignupPage();
  expect(
    screen.getByText(
      "Takes less than a minute — you'll land straight in the course catalog, ready to start your first lesson."
    )
  ).toBeInTheDocument();
});

test("links to the Terms of Service and Privacy Policy (Phase 7D)", () => {
  renderSignupPage();
  expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
  expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
});

test("a successful signup logs the new learner in and redirects to /courses", async () => {
  const user = userEvent.setup();
  authService.signup.mockResolvedValue({
    id: "u1",
    email: "ada@example.com",
    name: "Ada Lovelace",
    role: "learner",
  });
  authService.login.mockResolvedValue({
    user: { id: "u1", name: "Ada Lovelace", role: "learner" },
    accessToken: "token",
  });
  renderSignupPage();

  await fillAndSubmit(user);

  await waitFor(() => expect(screen.getByText("Course catalog")).toBeInTheDocument());
  expect(authService.signup).toHaveBeenCalledWith({
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "password123",
  });
  expect(authService.login).toHaveBeenCalledWith({
    email: "ada@example.com",
    password: "password123",
  });
  expect(screen.getByText("welcomeName: Ada Lovelace")).toBeInTheDocument();
});

test("a duplicate email highlights the email field specifically, using the backend's field hint", async () => {
  const user = userEvent.setup();
  authService.signup.mockRejectedValue({
    response: {
      data: {
        error: {
          code: "EMAIL_ALREADY_REGISTERED",
          message: "An account with this email already exists.",
          field: "email",
        },
      },
    },
  });
  renderSignupPage();

  await fillAndSubmit(user);

  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("An account with this email already exists.");
  expect(screen.getByLabelText("Your email")).toHaveAttribute("aria-invalid", "true");
  expect(authService.login).not.toHaveBeenCalled();
});

test("shows the password requirement hint by default", () => {
  renderSignupPage();
  expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
});

test("a too-short password is caught client-side, never reaches the network, and replaces the hint with a field error", async () => {
  const user = userEvent.setup();
  renderSignupPage();

  await fillAndSubmit(user, { password: "short" });

  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("Password must be at least 8 characters.");
  expect(screen.getByLabelText("Create password")).toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByText("At least 8 characters")).not.toBeInTheDocument();
  expect(authService.signup).not.toHaveBeenCalled();
});

test("a non-field signup error (e.g. network) shows the page-level banner, not a field error", async () => {
  const user = userEvent.setup();
  authService.signup.mockRejectedValue(new Error("network down"));
  renderSignupPage();

  await fillAndSubmit(user);

  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("Could not reach the server. Check your connection.");
  expect(screen.getByLabelText("Your email")).not.toHaveAttribute("aria-invalid");
});

test("if signup succeeds but the follow-up login fails, sends the learner to log in instead of showing an error", async () => {
  const user = userEvent.setup();
  authService.signup.mockResolvedValue({
    id: "u1",
    email: "ada@example.com",
    name: "Ada Lovelace",
    role: "learner",
  });
  authService.login.mockRejectedValue(new Error("transient network hiccup"));
  renderSignupPage();

  await fillAndSubmit(user);

  await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());
});

test("disables the form while submitting", async () => {
  const user = userEvent.setup();
  let resolveSignup;
  authService.signup.mockReturnValue(
    new Promise((resolve) => {
      resolveSignup = resolve;
    })
  );
  renderSignupPage();

  await fillAndSubmit(user);

  expect(screen.getByLabelText("Your name")).toBeDisabled();
  expect(screen.getByLabelText("Your email")).toBeDisabled();
  expect(screen.getByLabelText("Create password")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Create account" })).toHaveAttribute(
    "aria-busy",
    "true"
  );

  resolveSignup({ id: "u1", email: "ada@example.com", name: "Ada Lovelace", role: "learner" });
  await waitFor(() => expect(authService.login).toHaveBeenCalled());
});
