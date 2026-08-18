import { Apple } from "lucide-react";
import "./AuthSocialButtons.css";

// Matches a reference layout the user supplied directly, which showed Google/GitHub/Apple sign-in
// buttons -- this backend has no OAuth integration at all (email/password only), so these are
// real <button disabled> elements: visually present to match the reference, but honestly inert
// rather than implying a capability that doesn't exist. A functioning click handler that silently
// does nothing would be worse than not having the buttons at all.
export function AuthSocialButtons() {
  return (
    <div className="auth-social">
      <div className="auth-social__divider">
        <span>or continue with</span>
      </div>
      <div className="auth-social__row">
        <button
          type="button"
          className="auth-social__button"
          disabled
          aria-label="Continue with Google (not yet available)"
        >
          <GoogleGlyph />
        </button>
        <button
          type="button"
          className="auth-social__button"
          disabled
          aria-label="Continue with GitHub (not yet available)"
        >
          <GitHubGlyph />
        </button>
        <button
          type="button"
          className="auth-social__button"
          disabled
          aria-label="Continue with Apple (not yet available)"
        >
          <Apple size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// lucide-react has no Google mark (it's a general icon set, not brand logos) -- a plain lettered
// glyph avoids the risk of a hand-drawn multi-color "G" reading as broken or off-brand, and stays
// consistent with this app's own single-color icon language rather than reproducing Google's
// actual 4-color mark.
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
      <text x="9" y="12.5" textAnchor="middle" fontSize="9" fontWeight="600" fill="currentColor">
        G
      </text>
    </svg>
  );
}

// Same reasoning as GoogleGlyph -- no official octocat mark in lucide-react. A simple original
// silhouette (round head, two ear points, two eyes) evokes "GitHub" at a glance without
// reproducing GitHub's actual trademarked logo pixel-for-pixel.
function GitHubGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 1.5c-4.14 0-7.5 3.36-7.5 7.5 0 3.3 2.15 6.11 5.13 7.1.37.07.51-.16.51-.36v-1.4c-2.09.45-2.53-.87-2.53-.87-.34-.87-.83-1.1-.83-1.1-.68-.46.05-.45.05-.45.75.05 1.15.77 1.15.77.67 1.14 1.75.82 2.18.62.07-.49.26-.82.48-1-1.7-.19-3.48-.85-3.48-3.78 0-.84.3-1.51.79-2.05-.08-.19-.34-.98.08-2.05 0 0 .64-.2 2.1.79a7.3 7.3 0 0 1 3.83 0c1.46-.99 2.1-.79 2.1-.79.42 1.07.16 1.86.08 2.05.49.54.79 1.21.79 2.05 0 2.94-1.79 3.59-3.49 3.78.27.24.51.7.51 1.42v2.1c0 .2.14.44.52.36 2.98-.99 5.12-3.8 5.12-7.1 0-4.14-3.36-7.5-7.5-7.5z"
        fill="currentColor"
      />
    </svg>
  );
}
