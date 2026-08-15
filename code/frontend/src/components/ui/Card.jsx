import "./Card.css";

// `as` defaults to "div" (every existing call site is unaffected) -- added for DashboardPage's
// instructor sections, which need a real <section> landmark (so the h2s inside are reachable via
// heading/landmark navigation) while still getting Card's own elevation/padding styling, same
// reasoning as RevealSection.jsx's own `as` prop.
//
// Phase 10 (Milestone 1). `interactive` is opt-in, not the default: most Card usages wrap static
// content (a form section, a danger zone) that isn't itself clickable, so a hover-lift affordance
// there would imply an action that doesn't exist. Pass `interactive` only when Card itself (or its
// direct wrapping Link) is the clickable target -- see individual page CSS for cases that already
// define their own equivalent hover treatment on a wrapping element instead of using this prop.
export function Card({ as: Tag = "div", interactive = false, children, className = "", ...props }) {
  return (
    <Tag
      className={["card", interactive ? "card--interactive" : "", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </Tag>
  );
}
