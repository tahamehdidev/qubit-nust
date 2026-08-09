import { useEffect, useState } from "react";
import { useLocation, useNavigate, NavLink, Link } from "react-router-dom";
import { BookOpen, LayoutDashboard, Settings, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { RouteTransition } from "./RouteTransition.jsx";
// Reuses Button.css's classes for the anonymous-nav Sign up CTA without mounting a <Button>
// component -- same explicit side-effect import LandingPage.jsx already does for the same reason.
import "../ui/Button.css";
import "./AuthenticatedLayout.css";

// Real navigation, not the placeholder it used to be (nav-flow audit) -- every authenticated
// screen previously had no persistent way to reach /courses, /dashboard, or log out at all,
// short of typing a URL directly. Reuses the app's own site-wide tokens, same restraint as
// everywhere else in this system.
//
// Phase 5.5: this shell now also wraps /courses and /courses/:courseId, which are reachable
// without being logged in -- so the nav branches on auth state instead of always assuming a
// session exists. While isLoading (the silent-refresh-on-mount check AuthContext runs on every
// page load), neither variant renders -- showing the anonymous nav to an about-to-be-recognized
// returning user, even briefly, is exactly the kind of one-frame-wrong flash this project has
// had real flicker trouble with before; better to render nothing for that one tick, matching
// ProtectedRoute's own "render nothing while loading" convention.
export function AuthenticatedLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAuthenticated, isLoading } = useAuth();
  // SignupPage passes this via navigate()'s state on a successful signup -- otherwise signing up
  // is a visual non-event (form disappears, catalog appears, nothing marks the transition). Lives
  // here rather than on CourseCatalogPage itself since "acknowledge how we got here" is a
  // route-agnostic shell concern, not that specific screen's job.
  const [welcomeName, setWelcomeName] = useState(location.state?.welcomeName ?? null);

  useEffect(() => {
    if (!welcomeName) return;
    const timeoutId = setTimeout(() => setWelcomeName(null), 4000);
    return () => clearTimeout(timeoutId);
  }, [welcomeName]);

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  function navLinkClassName({ isActive }) {
    return (
      "authenticated-layout__nav-link" + (isActive ? " authenticated-layout__nav-link--active" : "")
    );
  }

  return (
    <div>
      <nav className="authenticated-layout__nav" aria-label="Main">
        <Link to="/" className="authenticated-layout__wordmark">
          Qubit
        </Link>
        {!isLoading && isAuthenticated ? (
          <>
            {/* Critique fix: was a plain Link with hover-only color, no persistent indicator of
                current location -- sighted users had to read the page's own h1 to confirm where
                they were, screen-reader users got nothing. NavLink applies aria-current="page" on
                the active route automatically; the active modifier class adds the visible cue. */}
            <NavLink to="/courses" className={navLinkClassName}>
              <BookOpen size={16} aria-hidden="true" />
              Courses
            </NavLink>
            <NavLink to="/dashboard" className={navLinkClassName}>
              <LayoutDashboard size={16} aria-hidden="true" />
              Dashboard
            </NavLink>
            {/* Phase 8A: admin's one dedicated destination (/admin/users) previously had no
                persistent nav entry -- reachable only via a card link on the admin's own
                dashboard, an orphaned-page problem the role-completeness audit flagged. */}
            {user?.role === "admin" ? (
              <NavLink to="/admin/users" className={navLinkClassName}>
                <ShieldCheck size={16} aria-hidden="true" />
                Admin
              </NavLink>
            ) : null}
            {/* Phase 8D: every role was previously missing any way to update their own name or
                change their password while logged in. */}
            <NavLink to="/settings" className={navLinkClassName}>
              <Settings size={16} aria-hidden="true" />
              Settings
            </NavLink>
            <button type="button" className="authenticated-layout__logout" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : null}
        {!isLoading && !isAuthenticated ? (
          <>
            <Link
              to="/login"
              className="authenticated-layout__nav-link authenticated-layout__nav-link--pushed"
            >
              Log in
            </Link>
            <Link to="/signup" className="button button--primary">
              Sign up
            </Link>
          </>
        ) : null}
      </nav>
      {welcomeName ? (
        <p className="authenticated-layout__welcome-toast" role="status">
          Account created — welcome, {welcomeName}.
        </p>
      ) : null}
      <RouteTransition />
      {/* Phase 7D: the only place Privacy/Terms were reachable from was the landing page's own
          footer -- every screen this shell wraps (courses, lessons, dashboard, and the public
          course-preview routes) had no way to reach them at all. Deliberately minimal, unlike
          the landing page's full footer -- this shell wraps focused task screens (the lesson
          player included), not a marketing page. */}
      <footer className="authenticated-layout__footer">
        <span>© {new Date().getFullYear()} Qubit — NUST</span>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Service</Link>
      </footer>
    </div>
  );
}
