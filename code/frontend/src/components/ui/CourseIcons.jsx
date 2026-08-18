// Extracted from LandingPage.jsx (Phase 5.5) so the Dashboard/Catalog/Course-Detail redesigns can
// reuse the same per-course visual identity instead of the flat text-only rows they had before.
// One-stroke line icons distinguishing the three courses from each other (not decoration on top
// of an otherwise-identical repeated card) -- currentColor, matching the design system's single
// calm-accent "restrained" strategy rather than inventing a per-course color palette.
export function NeuralNetIcon({ className }) {
  return (
    <svg
      className={className}
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="5" cy="8" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5" cy="20" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="14" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="23" cy="8" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="23" cy="20" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 9.3 12.2 13 M7 18.7 12.2 15 M15.8 13 21 9.3 M15.8 15 21 18.7"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function AlgorithmIcon({ className }) {
  return (
    <svg
      className={className}
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="5" cy="14" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="23" cy="6" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="23" cy="22" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7.2 13 15 7 M15 7h6 M7.2 15 15 21 M15 21h6"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function QubitChipIcon({ className }) {
  return (
    <svg
      className={className}
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="14" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M14 2v5 M14 21v5 M2 14h5 M21 14h5 M5.5 5.5l3.5 3.5 M19 19l3.5 3.5 M22.5 5.5 19 9 M9 19l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

// Keyed by title, not id -- LandingPage.jsx's own COURSES array already pairs icon-to-course by
// name, not by database id (ids are seed-load-order artifacts, not stable content identifiers;
// titles are the real, documented identity of each course per seed_README.md). Falls back to a
// generic icon for any future course this list doesn't yet know about, rather than rendering
// nothing.
export const COURSE_ICONS_BY_TITLE = {
  "Quantum Machine Learning": NeuralNetIcon,
  "Quantum Algorithms": AlgorithmIcon,
  "Quantum Computing Hardware": QubitChipIcon,
};

export function getCourseIcon(title) {
  return COURSE_ICONS_BY_TITLE[title] ?? QubitChipIcon;
}
