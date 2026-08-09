import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

// Reintroduced (Phase 8A) now that a second role-gated destination exists -- the original
// RoleGate.jsx was removed as dead code when AdminUsersPage was its only possible caller and
// hand-rolled its own inline check instead. Nested under ProtectedRoute in the route tree, so
// `user` is always already populated by the time this renders.
export function RoleGate({ allow }) {
  const { user } = useAuth();

  if (!allow.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
