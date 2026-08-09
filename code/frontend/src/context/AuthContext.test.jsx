import { test, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import { authService } from "../services/auth.service.js";
import { userService } from "../services/user.service.js";

vi.mock("../services/auth.service.js", () => ({
  authService: {
    login: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    refresh: vi.fn(),
  },
}));
vi.mock("../services/user.service.js", () => ({
  userService: { getMe: vi.fn() },
}));
// A real apiClient (not this test's fake) would try a real network call the moment
// configureAuth's getAccessToken is exercised through a request -- these tests only care that
// AuthContext calls configureAuth correctly, not apiClient's own interceptor behavior (already
// covered by apiClient.test.js), so requests themselves are mocked here too.
vi.mock("../services/apiClient.js", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  configureAuth: vi.fn(),
}));

function AuthConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="isLoading">{String(auth.isLoading)}</span>
      <span data-testid="isAuthenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="userName">{auth.user?.name ?? "none"}</span>
      <button onClick={() => auth.login({ email: "a@example.com", password: "pw" })}>login</button>
      <button onClick={() => auth.logout()}>logout</button>
      <button onClick={() => auth.logoutAll()}>logout-all</button>
      <button onClick={() => auth.updateUser({ name: "Updated Name" })}>update-user</button>
      <button onClick={() => auth.clearSession()}>clear-session</button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("restores a session across reload when the refresh cookie is still valid", async () => {
  authService.refresh.mockResolvedValue("fresh-token");
  userService.getMe.mockResolvedValue({ id: "u1", name: "Ada" });

  render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );

  expect(screen.getByTestId("isLoading").textContent).toBe("true");

  await waitFor(() => expect(screen.getByTestId("isLoading").textContent).toBe("false"));
  expect(screen.getByTestId("isAuthenticated").textContent).toBe("true");
  expect(screen.getByTestId("userName").textContent).toBe("Ada");
});

// Regression test for a real, live-confirmed bug: React 18 StrictMode double-invokes effects in
// dev, and refresh tokens are single-use with reuse triggering the backend's mass-revocation
// response -- without a guard, the mount effect's second (spurious) refreshAccessToken() call
// reads as token reuse and revokes the session the first call just legitimately restored, logging
// the user straight back out on every reload. Rendering inside a real <StrictMode> (not just
// asserting on the guard's internals) is what actually reproduces the double-invocation.
test("calls refreshAccessToken only once even under StrictMode's double-invoked mount effect", async () => {
  authService.refresh.mockResolvedValue("fresh-token");
  userService.getMe.mockResolvedValue({ id: "u1", name: "Ada" });

  render(
    <StrictMode>
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    </StrictMode>
  );

  await waitFor(() => expect(screen.getByTestId("isLoading").textContent).toBe("false"));
  expect(screen.getByTestId("isAuthenticated").textContent).toBe("true");
  expect(authService.refresh).toHaveBeenCalledTimes(1);
});

test("starts logged out when there is no valid refresh cookie", async () => {
  authService.refresh.mockRejectedValue(new Error("no refresh cookie"));

  render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );

  await waitFor(() => expect(screen.getByTestId("isLoading").textContent).toBe("false"));
  expect(screen.getByTestId("isAuthenticated").textContent).toBe("false");
  expect(userService.getMe).not.toHaveBeenCalled();
});

test("login() sets user and accessToken from the response", async () => {
  authService.refresh.mockRejectedValue(new Error("no session yet"));
  authService.login.mockResolvedValue({
    user: { id: "u2", name: "Bea" },
    accessToken: "login-token",
  });

  render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByTestId("isLoading").textContent).toBe("false"));

  screen.getByText("login").click();
  await waitFor(() => expect(screen.getByTestId("isAuthenticated").textContent).toBe("true"));
  expect(screen.getByTestId("userName").textContent).toBe("Bea");
});

test("logout() clears user/accessToken even if the backend call fails", async () => {
  authService.refresh.mockResolvedValue("fresh-token");
  userService.getMe.mockResolvedValue({ id: "u1", name: "Ada" });
  authService.logout.mockRejectedValue(new Error("network error"));

  render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByTestId("isAuthenticated").textContent).toBe("true"));

  screen.getByText("logout").click();
  await waitFor(() => expect(screen.getByTestId("isAuthenticated").textContent).toBe("false"));
  expect(screen.getByTestId("userName").textContent).toBe("none");
});

test("logoutAll() clears user/accessToken", async () => {
  authService.refresh.mockResolvedValue("fresh-token");
  userService.getMe.mockResolvedValue({ id: "u1", name: "Ada" });
  authService.logoutAll.mockResolvedValue(undefined);

  render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByTestId("isAuthenticated").textContent).toBe("true"));

  screen.getByText("logout-all").click();
  await waitFor(() => expect(screen.getByTestId("isAuthenticated").textContent).toBe("false"));
});

test("updateUser() merges a patch into the current user without a backend call", async () => {
  authService.refresh.mockResolvedValue("fresh-token");
  userService.getMe.mockResolvedValue({ id: "u1", name: "Ada" });

  render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByTestId("userName").textContent).toBe("Ada"));

  screen.getByText("update-user").click();
  await waitFor(() => expect(screen.getByTestId("userName").textContent).toBe("Updated Name"));
});

// Phase 8D: a password change already revokes every session server-side -- SettingsPage uses
// clearSession() to drop local state without a redundant logout() call against a session that's
// already gone.
test("clearSession() clears user/isAuthenticated without calling any backend endpoint", async () => {
  authService.refresh.mockResolvedValue("fresh-token");
  userService.getMe.mockResolvedValue({ id: "u1", name: "Ada" });

  render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByTestId("isAuthenticated").textContent).toBe("true"));

  screen.getByText("clear-session").click();
  await waitFor(() => expect(screen.getByTestId("isAuthenticated").textContent).toBe("false"));
  expect(authService.logout).not.toHaveBeenCalled();
  expect(authService.logoutAll).not.toHaveBeenCalled();
});

test("registers configureAuth once on mount with functions apiClient can call", async () => {
  authService.refresh.mockRejectedValue(new Error("no session"));

  render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByTestId("isLoading").textContent).toBe("false"));

  const { configureAuth } = await import("../services/apiClient.js");
  expect(configureAuth).toHaveBeenCalledTimes(1);
  const registered = configureAuth.mock.calls[0][0];
  expect(typeof registered.getAccessToken).toBe("function");
  expect(typeof registered.refreshAccessToken).toBe("function");
});

test("useAuth() throws when used outside an AuthProvider", () => {
  // Suppress the expected React error-boundary console noise for this one assertion.
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  function Bare() {
    useAuth();
    return null;
  }
  expect(() => render(<Bare />)).toThrow("useAuth must be used within an AuthProvider.");
  consoleSpy.mockRestore();
});
