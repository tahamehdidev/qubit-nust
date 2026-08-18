import { test, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { courseService } from "../services/course.service.js";
import { LandingPage } from "./LandingPage.jsx";

vi.mock("../services/course.service.js", () => ({
  courseService: { list: vi.fn() },
}));

beforeEach(() => {
  // Never resolves by default -- most tests here don't care about the course-card links, so this
  // just keeps them pinned to the "/courses" fallback instead of triggering an unhandled-rejection
  // warning from a real fetch attempt in jsdom.
  courseService.list.mockReturnValue(new Promise(() => {}));
});

// LandingHeroVisual's own tests cover its rendering/prop-passthrough in isolation now that it's
// a controlled, presentational component; the drag/idle-animation/readout-reveal state it used to
// own itself now lives here in LandingPage, so that behavior is tested here instead. onMouseDown
// simulates a drag in progress (onDrag only); onClick simulates a full tap -- drag to a point,
// then release (onDrag followed by onDragEnd), matching a real pointerdown+pointerup.
vi.mock("../components/widgets/BlochSphereScene.jsx", () => ({
  BlochSphereScene: ({ theta, phi, draggable, onDrag, onDragEnd }) => (
    <div
      data-testid="hero-scene"
      data-draggable={draggable}
      data-theta={theta}
      data-phi={phi}
      onMouseDown={() => onDrag({ theta: 1, phi: 2 })}
      onClick={() => {
        onDrag({ theta: 1, phi: 2 });
        onDragEnd();
      }}
    />
  ),
}));

const originalMatchMedia = window.matchMedia;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalWebGLRenderingContext = window.WebGLRenderingContext;

function mockReducedMotion(matches) {
  window.matchMedia = () => ({
    matches,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

function mockWebglAvailable(available) {
  window.WebGLRenderingContext = available ? function WebGLRenderingContext() {} : undefined;
  HTMLCanvasElement.prototype.getContext = available ? () => ({}) : () => null;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  window.WebGLRenderingContext = originalWebGLRenderingContext;
});

function renderLandingPage() {
  return render(
    <BrowserRouter>
      <LandingPage />
    </BrowserRouter>
  );
}

test("renders the hero heading and tagline", () => {
  renderLandingPage();
  expect(
    screen.getByRole("heading", { level: 1, name: "See the qubit before you compute with it." })
  ).toBeInTheDocument();
  expect(screen.getByText(/Drag the arrow and watch the numbers respond/)).toBeInTheDocument();
});

test("bridges the hero's own notation against the Method section's 'picture first' promise", () => {
  // Nav-flow/critique fix: the hero showed raw bra-ket/Greek notation on first paint, directly
  // contradicting the Method section's "Formal notation comes later" pitch a few scrolls down.
  // This caption is NOT inside the aria-hidden readout, so it's the one place a screen-reader
  // user gets this reassurance too, not just sighted visitors who notice the small mono readout.
  renderLandingPage();
  expect(
    screen.getByText("No notation to learn yet — the sphere is doing the explaining, not you.")
  ).toBeInTheDocument();
});

test("renders a reassurance line near the hero CTA about cost/commitment", () => {
  // Dual-agent critique finding: none of the page's 4 "Start learning" CTAs said anything about
  // cost or time commitment, at the single highest-stakes moment on the page.
  renderLandingPage();
  expect(screen.getByText("Free to start — no card required.")).toBeInTheDocument();
});

test("renders a skip-to-content link as the first focusable element", () => {
  // Dual-agent critique finding: a keyboard user had to tab through 6 navbar stops with no way
  // to bypass them before reaching any hero content.
  renderLandingPage();
  const skipLink = screen.getByRole("link", { name: "Skip to content" });
  expect(skipLink).toHaveAttribute("href", "#landing-main-content");
  expect(document.getElementById("landing-main-content")).toHaveClass("landing-page");
});

test("hero CTA links to signup", () => {
  renderLandingPage();
  // Scoped to the hero heading's own section -- LandingNavbar (tested separately in
  // LandingNavbar.test.jsx) and the Final CTA (standardized to the same copy) both render
  // "Start learning" too, so an unscoped query would match multiple elements. The hero no longer
  // has a "Log in" link (removed per request -- the navbar's own Log in is the one entry point).
  const hero = screen
    .getByRole("heading", { level: 1, name: "See the qubit before you compute with it." })
    .closest("section");
  expect(within(hero).getByRole("link", { name: "Start learning" })).toHaveAttribute(
    "href",
    "/signup"
  );
  expect(within(hero).queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
});

test("shows the P(|0>)/P(|1>) + theta/phi readout in the hero copy column at all times, updating live as the sphere is dragged", () => {
  mockReducedMotion(false);
  mockWebglAvailable(true);
  const { container } = renderLandingPage();

  // Visible immediately, before any interaction -- showing the initial static/idle angles, not
  // gated behind a first-drag reveal.
  const readout = container.querySelector(".landing-page__hero-readout");
  expect(readout).toBeInTheDocument();
  expect(readout).toHaveTextContent(/P\(\|0⟩\) ≈ \d+% · P\(\|1⟩\) ≈ \d+%/);

  fireEvent.click(screen.getByTestId("hero-scene")); // drags to {theta: 1, phi: 2} radians

  expect(readout).toHaveTextContent("P(|0⟩) ≈ 77% · P(|1⟩) ≈ 23%");
  // 1 rad ≈ 57°, 2 rad ≈ 115° -- the same angles the P(|0>)/P(|1>) split above is derived from.
  expect(readout).toHaveTextContent("θ ≈ 57° · φ ≈ 115°");
});

test("the hero sphere is keyboard-operable via arrow keys, matching a drag's own update path (critique fix)", () => {
  mockReducedMotion(false);
  mockWebglAvailable(true);
  const { container } = renderLandingPage();

  const group = screen.getByRole("group", { name: /rotate it/ });
  const readout = container.querySelector(".landing-page__hero-readout");
  const initialReadout = readout.textContent;

  fireEvent.keyDown(group, { key: "ArrowRight" });

  expect(readout.textContent).not.toBe(initialReadout);
});

test("does not render the hero readout at all when WebGL isn't available", () => {
  mockReducedMotion(false);
  mockWebglAvailable(false);
  const { container } = renderLandingPage();

  expect(container.querySelector(".landing-page__hero-readout")).not.toBeInTheDocument();
});

test("resumes the ambient sphere animation once a drag releases, instead of staying frozen", () => {
  vi.useFakeTimers();
  mockReducedMotion(false);
  mockWebglAvailable(true);
  renderLandingPage();

  const scene = screen.getByTestId("hero-scene");
  fireEvent.click(scene); // drag to {theta: 1, phi: 2}, then release (onDragEnd)

  const thetaRightAfterRelease = scene.getAttribute("data-theta");
  const phiRightAfterRelease = scene.getAttribute("data-phi");

  act(() => {
    vi.advanceTimersByTime(5000);
  });

  expect(scene.getAttribute("data-theta")).not.toBe(thetaRightAfterRelease);
  expect(scene.getAttribute("data-phi")).not.toBe(phiRightAfterRelease);

  vi.useRealTimers();
});

test("renders all three courses with their verbatim core questions", () => {
  renderLandingPage();

  expect(screen.getByRole("heading", { name: "Quantum Machine Learning" })).toBeInTheDocument();
  expect(
    screen.getByText(
      'If a quantum computer can hold and transform exponentially more information than a classical bit register, can it learn patterns the way a neural network does — and what does "learning" even mean when the model is a quantum circuit?'
    )
  ).toBeInTheDocument();

  expect(screen.getByRole("heading", { name: "Quantum Algorithms" })).toBeInTheDocument();
  expect(
    screen.getByText(
      "What can a quantum computer actually compute that a classical computer structurally cannot do efficiently — and why does that threaten the cryptography the entire internet currently relies on?"
    )
  ).toBeInTheDocument();

  expect(screen.getByRole("heading", { name: "Quantum Computing Hardware" })).toBeInTheDocument();
  expect(
    screen.getByText(
      "A qubit is a delicate physical thing, not just a mathematical symbol — so what does it actually take, physically, to build, control, and keep one alive long enough to compute anything useful?"
    )
  ).toBeInTheDocument();
});

test("a course card links to the catalog before its real course ID has loaded", () => {
  renderLandingPage();

  expect(screen.getByRole("link", { name: /Quantum Machine Learning/ })).toHaveAttribute(
    "href",
    "/courses"
  );
});

test("a course card links to its own course detail page once the real ID resolves", async () => {
  courseService.list.mockResolvedValue({
    courses: [
      { id: 9, title: "Quantum Machine Learning" },
      { id: 10, title: "Quantum Algorithms" },
      { id: 8, title: "Quantum Computing Hardware" },
    ],
  });
  renderLandingPage();

  expect(await screen.findByRole("link", { name: /Quantum Machine Learning/ })).toHaveAttribute(
    "href",
    "/courses/9"
  );
  expect(screen.getByRole("link", { name: /Quantum Algorithms/ })).toHaveAttribute(
    "href",
    "/courses/10"
  );
  expect(screen.getByRole("link", { name: /Quantum Computing Hardware/ })).toHaveAttribute(
    "href",
    "/courses/8"
  );
});

test("start-anywhere section lists all three courses with their entry notes", () => {
  renderLandingPage();
  const section = document.getElementById("start-anywhere");
  expect(within(section).getByText("Quantum Machine Learning")).toBeInTheDocument();
  expect(
    within(section).getByText("Starts from the qubit itself — no prior linear algebra assumed.")
  ).toBeInTheDocument();
  expect(within(section).getByText("Quantum Algorithms")).toBeInTheDocument();
  expect(within(section).getByText("Quantum Computing Hardware")).toBeInTheDocument();
});

test("start-anywhere section has its own CTA, so a convinced visitor doesn't have to scroll away to act", () => {
  // Critique fix: previously no conversion point existed between the hero and the final CTA
  // band, forcing a scroll all the way back up/down from the natural "I'm convinced" moment
  // right after seeing all three entry points.
  renderLandingPage();
  const section = document.getElementById("start-anywhere");
  expect(within(section).getByRole("link", { name: "Start learning" })).toHaveAttribute(
    "href",
    "/signup"
  );
});

test("final CTA links to signup", () => {
  renderLandingPage();
  // Scoped to the final CTA's own heading -- "Start learning" (standardized from "Create your
  // account", critique finding) now appears in the navbar and hero too, so an unscoped query
  // would match multiple elements.
  const finalCta = screen
    .getByRole("heading", {
      name: "Start with the first thing every course teaches: what a qubit actually is.",
    })
    .closest("section");
  expect(within(finalCta).getByRole("link", { name: "Start learning" })).toHaveAttribute(
    "href",
    "/signup"
  );
});

test("renders the method section's explanation of the visual-first approach", () => {
  renderLandingPage();
  expect(
    screen.getByRole("heading", { name: "Formal notation comes later. The picture comes first." })
  ).toBeInTheDocument();
  expect(screen.getByText(/a qubit as a literal arrow on a sphere/)).toBeInTheDocument();
});

test("renders a footer with the wordmark and a one-line description", () => {
  renderLandingPage();
  const footer = document.querySelector(".landing-page__footer");
  // toHaveTextContent (not getByText) -- the wordmark's "— NUST" affiliation sits in its own
  // nested span, so the full "Qubit — NUST" string isn't any single element's own text node.
  expect(footer.querySelector(".landing-wordmark__text")).toHaveTextContent("Qubit — NUST");
  expect(
    within(footer).getByText(/Quantum machine learning, algorithms, and hardware/)
  ).toBeInTheDocument();
});
