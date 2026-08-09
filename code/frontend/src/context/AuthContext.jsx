import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { authService } from "../services/auth.service.js";
import { userService } from "../services/user.service.js";
import { configureAuth } from "../services/apiClient.js";

const AuthContext = createContext(null);

// user/accessToken are held in-memory only, never localStorage/sessionStorage
// (03-security-architecture.md §2.1) -- a page reload always starts from nothing here, which is
// exactly why the silent-refresh-on-mount effect below exists: the httpOnly refresh cookie is
// the only thing that survives a reload, so it's used once to try to rebuild the session.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // True until the mount-time silent-refresh attempt resolves either way -- ProtectedRoute must
  // wait for this before deciding to redirect, or a logged-in user gets bounced to /login on
  // every reload during the brief window before that attempt completes.
  const [isLoading, setIsLoading] = useState(true);

  // The access token lives ONLY in this ref, not React state -- apiClient's getAccessToken()
  // needs a synchronously up-to-date value (React state only reflects a setState call after the
  // next render), and no consumer anywhere re-renders on the token itself changing: the
  // meaningful reactive signal is `user`/`isAuthenticated`, already covered by state above.
  // Keeping a second, state-backed copy in sync would only add a "must never drift" risk for a
  // value nothing reads -- so it's simply not exposed via context at all.
  const accessTokenRef = useRef(null);
  const updateAccessToken = useCallback((token) => {
    accessTokenRef.current = token;
  }, []);

  // Shared by refreshAccessToken's failure path and logout()/logoutAll() below -- all three were
  // independently repeating this exact pair, which is a real invariant ("always clear local
  // session on failure/logout") that must not quietly diverge between call sites, not just
  // incidentally similar code.
  const clearSession = useCallback(() => {
    updateAccessToken(null);
    setUser(null);
  }, [updateAccessToken]);

  const refreshAccessToken = useCallback(async () => {
    try {
      const newToken = await authService.refresh();
      updateAccessToken(newToken);
      return newToken;
    } catch (err) {
      clearSession();
      throw err;
    }
  }, [updateAccessToken, clearSession]);

  // Registered once, on mount -- apiClient.js is built against this interface specifically so it
  // never has to import AuthContext directly (Frontend Milestone 1).
  useEffect(() => {
    configureAuth({ getAccessToken: () => accessTokenRef.current, refreshAccessToken });
  }, [refreshAccessToken]);

  // Guards against React 18 StrictMode's dev-only double-invocation of this effect -- confirmed
  // live (not just theorized) that without this guard, the mount effect calls refreshAccessToken()
  // twice against the same starting refresh cookie. Refresh tokens are single-use with rotation,
  // and reuse triggers the backend's deliberate mass-revocation security response (correct
  // behavior for a real stolen-token replay) -- so the second, spurious call reads as "reuse" and
  // revokes every token for the user, including the one the first call just legitimately rotated
  // to. Net effect without this guard: every reload silently logs the user back out almost
  // immediately in dev. AuthProvider is mounted once at the app root for the app's entire
  // lifetime (main.jsx), so there's no real unmount case to protect against here -- the previous
  // `cancelled`-on-cleanup pattern was guarding the wrong thing (StrictMode's synthetic unmount,
  // which it can't actually prevent) instead of preventing the second call from firing at all.
  const hasAttemptedRestoreRef = useRef(false);
  useEffect(() => {
    if (hasAttemptedRestoreRef.current) return;
    hasAttemptedRestoreRef.current = true;

    async function restoreSession() {
      try {
        await refreshAccessToken(); // updates accessTokenRef before getMe() needs it
        const me = await userService.getMe();
        setUser(me);
      } catch {
        // No valid refresh cookie, or it resolved but getMe() failed -- either way, start logged
        // out. refreshAccessToken() has already cleared user/accessToken on its own failure path.
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only
  }, []);

  const login = useCallback(
    async ({ email, password }) => {
      const { user: loggedInUser, accessToken: newToken } = await authService.login({
        email,
        password,
      });
      updateAccessToken(newToken);
      setUser(loggedInUser);
      return loggedInUser;
    },
    [updateAccessToken]
  );

  // Clears local session state even if the backend call fails (network error, etc.) -- the
  // user's intent to log out on this device should never be blocked by a failed server round
  // trip; the refresh token will simply age out or get rotated away on its own. The error is
  // swallowed, not just cleaned-up-after (a bare finally still re-throws): logout() can't
  // meaningfully fail from the caller's side, so nothing calling it should have to handle a
  // rejection that only ever means "the server-side revocation didn't land."
  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // handled above
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const logoutAll = useCallback(async () => {
    try {
      await authService.logoutAll();
    } catch {
      // handled above
    } finally {
      clearSession();
    }
  }, [clearSession]);

  // Phase 8D: SettingsPage calls this after a successful PATCH /users/me so the nav/dashboard
  // reflect a new name immediately, without a full reload -- merges rather than replaces, so a
  // caller only needs to pass the fields that actually changed.
  const updateUser = useCallback((patch) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    login,
    logout,
    logoutAll,
    refreshAccessToken,
    updateUser,
    // Phase 8D: a password change revokes every session server-side, including this one --
    // SettingsPage uses this to drop local session state without a redundant logout() API call
    // that would just fail against an already-revoked session.
    clearSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
