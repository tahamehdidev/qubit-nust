import { test, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { AuthenticatedLayout } from "./AuthenticatedLayout.jsx";

vi.mock("../../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));

function renderAt(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<AuthenticatedLayout />}>
          <Route path="/courses" element={<div>Course catalog</div>} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route path="/" element={<div>Landing</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

test("renders no welcome toast when there's no welcomeName in router state", () => {
  useAuth.mockReturnValue({ logout: vi.fn(), isAuthenticated: true, isLoading: false });
  renderAt("/courses");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("renders a welcome toast from location.state.welcomeName", () => {
  useAuth.mockReturnValue({ logout: vi.fn(), isAuthenticated: true, isLoading: false });
  renderAt({ pathname: "/courses", state: { welcomeName: "Ada Lovelace" } });
  expect(screen.getByRole("status")).toHaveTextContent("Account created — welcome, Ada Lovelace.");
});

test("the welcome toast dismisses itself after a few seconds", async () => {
  useAuth.mockReturnValue({ logout: vi.fn(), isAuthenticated: true, isLoading: false });
  vi.useFakeTimers();
  renderAt({ pathname: "/courses", state: { welcomeName: "Ada Lovelace" } });
  expect(screen.getByRole("status")).toBeInTheDocument();

  // waitFor's own polling relies on real timers, which deadlocks once fake timers are active --
  // advancing fake time asynchronously flushes the effect's setTimeout callback directly instead.
  await vi.advanceTimersByTimeAsync(4000);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

// Nav-flow audit: this whole nav used to be a literal empty placeholder comment -- no persistent
// way to reach /dashboard or log out existed anywhere in the app.
test("authenticated: renders persistent Courses and Dashboard links, plus Log out", () => {
  useAuth.mockReturnValue({ logout: vi.fn(), isAuthenticated: true, isLoading: false });
  renderAt("/courses");
  expect(screen.getByRole("link", { name: "Courses" })).toHaveAttribute("href", "/courses");
  expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
  expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
});

// Phase 8A: /admin/users previously had no persistent nav entry at all -- reachable only via a
// card link on the admin's own dashboard.
test("admin: renders an Admin nav link pointing at /admin/users", () => {
  useAuth.mockReturnValue({
    user: { id: "a1", role: "admin" },
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  });
  renderAt("/courses");
  expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin/users");
});

// Phase 8C: admin's platform-wide cohort visibility, previously unreachable at all.
test("admin: renders a Cohorts nav link pointing at /admin/cohorts", () => {
  useAuth.mockReturnValue({
    user: { id: "a1", role: "admin" },
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  });
  renderAt("/courses");
  expect(screen.getByRole("link", { name: "Cohorts" })).toHaveAttribute("href", "/admin/cohorts");
});

// Phase 8B: real cohort management, previously reachable via no nav link at all.
test("instructor: renders a Cohorts nav link pointing at /cohorts", () => {
  useAuth.mockReturnValue({
    user: { id: "i1", role: "instructor" },
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  });
  renderAt("/courses");
  expect(screen.getByRole("link", { name: "Cohorts" })).toHaveAttribute("href", "/cohorts");
});

test("non-instructor: renders no Cohorts nav link", () => {
  useAuth.mockReturnValue({
    user: { id: "l1", role: "learner" },
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  });
  renderAt("/courses");
  expect(screen.queryByRole("link", { name: "Cohorts" })).not.toBeInTheDocument();
});

// Phase 9: content authoring, open to both instructor and admin.
test.each(["instructor", "admin"])(
  "%s: renders a Content nav link pointing at /admin/content",
  (role) => {
    useAuth.mockReturnValue({
      user: { id: "u1", role },
      logout: vi.fn(),
      isAuthenticated: true,
      isLoading: false,
    });
    renderAt("/courses");
    expect(screen.getByRole("link", { name: "Content" })).toHaveAttribute("href", "/admin/content");
  }
);

test("learner: renders no Content nav link", () => {
  useAuth.mockReturnValue({
    user: { id: "l1", role: "learner" },
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  });
  renderAt("/courses");
  expect(screen.queryByRole("link", { name: "Content" })).not.toBeInTheDocument();
});

test("non-admin: renders no Admin nav link", () => {
  useAuth.mockReturnValue({
    user: { id: "i1", role: "instructor" },
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  });
  renderAt("/courses");
  expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
});

// Phase 8D: previously no role had any persistent way to reach account settings.
test("renders a Settings nav link for every authenticated role", () => {
  useAuth.mockReturnValue({
    user: { id: "l1", role: "learner" },
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  });
  renderAt("/courses");
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
});

// Critique fix: nav previously gave zero indication of current location -- color only changed
// on :hover and reverted the instant the mouse left, nothing for a screen reader.
test("marks the current route's nav link as active, both visually and via aria-current", () => {
  useAuth.mockReturnValue({ logout: vi.fn(), isAuthenticated: true, isLoading: false });
  renderAt("/dashboard");

  const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
  const coursesLink = screen.getByRole("link", { name: "Courses" });
  expect(dashboardLink).toHaveAttribute("aria-current", "page");
  expect(dashboardLink.className).toContain("authenticated-layout__nav-link--active");
  expect(coursesLink).not.toHaveAttribute("aria-current");
  expect(coursesLink.className).not.toContain("authenticated-layout__nav-link--active");
});

test("Log out calls AuthContext's logout() and navigates to the landing page", async () => {
  const logout = vi.fn().mockResolvedValue();
  useAuth.mockReturnValue({ logout, isAuthenticated: true, isLoading: false });
  const user = userEvent.setup();
  renderAt("/courses");

  await user.click(screen.getByRole("button", { name: "Log out" }));

  expect(logout).toHaveBeenCalled();
  expect(await screen.findByText("Landing")).toBeInTheDocument();
});

// Phase 5.5: /courses is now reachable without a session, so the nav must never show
// Courses/Dashboard/Log out to a visitor who was never logged in.
test("anonymous: renders Log in / Sign up instead of Courses/Dashboard/Log out", () => {
  useAuth.mockReturnValue({ logout: vi.fn(), isAuthenticated: false, isLoading: false });
  renderAt("/courses");

  expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup");
  expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
});

// Phase 7D: previously the only place Privacy/Terms were reachable from was the landing page's
// own footer -- every screen this shell wraps had no way to reach them.
test("renders a footer with Privacy Policy and Terms of Service links, regardless of auth state", () => {
  useAuth.mockReturnValue({ logout: vi.fn(), isAuthenticated: false, isLoading: false });
  renderAt("/courses");
  expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
});

// The silent-refresh-on-mount check runs on every page load -- showing the anonymous nav to an
// about-to-be-recognized returning user, even for one frame, is exactly the kind of flash this
// project has had real flicker trouble with before (see RouteTransition.jsx's own history).
test("while auth state is still loading, neither nav variant renders", () => {
  useAuth.mockReturnValue({ logout: vi.fn(), isAuthenticated: false, isLoading: true });
  renderAt("/courses");

  expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Courses" })).not.toBeInTheDocument();
  // The wordmark and the page content underneath still render -- only the auth-dependent nav
  // links are withheld.
  expect(screen.getByRole("link", { name: "Qubit" })).toBeInTheDocument();
  expect(screen.getByText("Course catalog")).toBeInTheDocument();
});
