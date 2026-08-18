import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { LandingWordmark } from "./LandingLogo.jsx";
import "../components/ui/Button.css";
import "./LandingNavbar.css";

const SECTION_LINKS = [
  { href: "#courses", label: "Courses" },
  { href: "#start-anywhere", label: "Start anywhere" },
  { href: "#method", label: "How it works" },
];

// Solid full-width bar (light-mode identity swap) -- isScrolled only toggles a hairline border,
// not opacity/blur, since a solid bg needs no legibility mechanism against scrolled content the
// way the previous glass treatment did. The mobile menu is a full-screen opaque overlay with
// background scroll locked while open.
export function LandingNavbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Past ~half the initial viewport height (roughly the hero's own scroll-past point) the bar
  // gains a hairline bottom border -- a subtle separation cue once content is moving underneath
  // it, absent at the very top where it sits flush against the hero.
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > window.innerHeight * 0.5);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // The mobile menu is now a full-screen overlay (critique fix), so background scroll needs to
  // be locked while it's open -- otherwise the page behind it can still scroll, which reads as
  // broken for what's meant to be a full takeover. Restored unconditionally on unmount too, not
  // just on close, in case the component ever goes away while the menu happens to be open.
  useEffect(() => {
    if (!isMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMenuOpen]);

  // Critique finding: a full-screen overlay with no Escape handler breaks the near-universal
  // modal-dismiss convention. This overlay is a plain <div>, not the app's own Modal.jsx (which
  // gets Escape-to-close for free from a native <dialog>'s onCancel) -- so it needs its own
  // listener. Gated the same way the scroll-lock effect above is, so it only listens while
  // actually open.
  useEffect(() => {
    if (!isMenuOpen) return;
    function handleKeyDown(event) {
      if (event.key === "Escape") setIsMenuOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <header className={"landing-navbar" + (isScrolled ? " landing-navbar--scrolled" : "")}>
      <div className="landing-navbar__bar">
        <Link to="/" className="landing-navbar__wordmark" onClick={closeMenu}>
          <LandingWordmark />
        </Link>

        <nav className="landing-navbar__links" aria-label="Page sections">
          {SECTION_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="landing-navbar__link">
              {link.label}
            </a>
          ))}
        </nav>

        {/* Grouped so the 3-column grid below has exactly three direct children (wordmark |
            centered links | this) -- the toggle button is a fourth sibling otherwise, which
            would either need a 4th track or fall back to implicit grid placement. */}
        <div className="landing-navbar__right">
          <div className="landing-navbar__actions">
            <Link
              to="/login"
              className="button button--secondary landing-navbar__cta landing-cta landing-glass-pill"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="button button--primary landing-navbar__cta landing-cta landing-glass-pill"
            >
              Start learning
            </Link>
          </div>

          <button
            type="button"
            className="landing-navbar__menu-toggle"
            aria-expanded={isMenuOpen}
            aria-controls="landing-navbar-mobile-menu"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? (
              <X size={22} aria-hidden="true" />
            ) : (
              <Menu size={22} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {isMenuOpen ? (
        <div id="landing-navbar-mobile-menu" className="landing-navbar__mobile-menu">
          {SECTION_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="landing-navbar__mobile-link"
              onClick={closeMenu}
            >
              {link.label}
            </a>
          ))}
          <div className="landing-navbar__mobile-actions">
            <Link
              to="/login"
              className="button button--secondary landing-navbar__cta landing-cta"
              onClick={closeMenu}
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="button button--primary landing-navbar__cta landing-cta"
              onClick={closeMenu}
            >
              Start learning
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
