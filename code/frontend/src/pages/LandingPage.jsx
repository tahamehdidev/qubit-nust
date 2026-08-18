import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card.jsx";
import { RevealSection } from "../components/ui/RevealSection.jsx";
import { NeuralNetIcon, AlgorithmIcon, QubitChipIcon } from "../components/ui/CourseIcons.jsx";
import { LandingHeroVisual, isWebglAvailable } from "./LandingHeroVisual.jsx";
import { LandingNavbar } from "./LandingNavbar.jsx";
import { LandingWordmark } from "./LandingLogo.jsx";
import { useReducedMotion } from "../hooks/useReducedMotion.js";
import { probabilityOf0 } from "../components/widgets/blochPhysics.js";
import { courseService } from "../services/course.service.js";
// Button.jsx itself always renders a real <button> (wrong semantics for pure navigation), so
// these CTAs are plain <Link>s wearing Button.css's classes instead -- but that CSS only loads
// when something imports it, and no <Button> component is ever mounted on this page. Explicit
// side-effect import, same as every component importing its own co-located CSS.
import "../components/ui/Button.css";
import "./LandingTheme.css";
import "./LandingPage.css";

// Core questions are quoted verbatim from docs/07-course-narratives-spine.md, not rewritten --
// each course is genuinely built around answering this one question, so it's the real, specific
// pitch rather than generic marketing copy standing in for it.
// Chapter/lesson counts are the real seed-data row counts (code/backend/seeds/seed_README.md),
// not placeholder numbers -- each course's actual documented shape.
const COURSES = [
  {
    name: "Quantum Machine Learning",
    Icon: NeuralNetIcon,
    coreQuestion:
      'If a quantum computer can hold and transform exponentially more information than a classical bit register, can it learn patterns the way a neural network does — and what does "learning" even mean when the model is a quantum circuit?',
    entryNote: "Starts from the qubit itself — no prior linear algebra assumed.",
    chapters: 6,
    lessons: 25,
  },
  {
    name: "Quantum Algorithms",
    Icon: AlgorithmIcon,
    coreQuestion:
      "What can a quantum computer actually compute that a classical computer structurally cannot do efficiently — and why does that threaten the cryptography the entire internet currently relies on?",
    entryNote: "Builds from gates to Shor's threat against RSA, one escalating story.",
    chapters: 6,
    lessons: 24,
  },
  {
    name: "Quantum Computing Hardware",
    Icon: QubitChipIcon,
    coreQuestion:
      "A qubit is a delicate physical thing, not just a mathematical symbol — so what does it actually take, physically, to build, control, and keep one alive long enough to compute anything useful?",
    entryNote: "Follows one computation's real physical lifecycle, chip to decoherence.",
    chapters: 6,
    lessons: 22,
  },
];

// A slow, calm idle drift -- not a spin. Long periods on purpose: this is standing in for a hero
// photograph (docs' own "imagery" requirement for a brand-register page), and a fast-moving
// centerpiece would read as flashy, contradicting the "precision instrument" personality. Owned
// here (not LandingHeroVisual) since the readout these angles drive now lives in the hero copy
// column, not beside the sphere -- one shared state owner for both.
const ROTATION_PERIOD_MS = 26_000; // one full azimuthal orbit
const BREATH_PERIOD_MS = 18_000; // theta drifts between two bounds and back
const THETA_MIN = Math.PI / 3;
const THETA_MAX = (2 * Math.PI) / 3;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// The angles shown whenever the arrow isn't animating (prefers-reduced-motion, or WebGL isn't
// available at all) -- a three-quarter angle, not a pole. A pole would look like the visual is
// broken/empty rather than deliberately static.
const STATIC_THETA = Math.PI / 2.4;
const STATIC_PHI = Math.PI / 4;

export function LandingPage() {
  // Hero sphere angles + drag/idle-animation state -- owned here (not LandingHeroVisual) since
  // the P(|0>)/P(|1>) readout these numbers drive now lives in the hero copy column, under the
  // tagline, not beside the sphere.
  const prefersReducedMotion = useReducedMotion();
  const [webglAvailable] = useState(isWebglAvailable);
  const [angles, setAngles] = useState({ theta: STATIC_THETA, phi: STATIC_PHI });
  // Always current, read (not depended on) inside the animation effect below -- lets that effect
  // resume from wherever a drag left the arrow without needing `angles` in its dependency array
  // (which would restart the loop's own timing baseline on every one of its own frames).
  const anglesRef = useRef(angles);

  function updateAngles(newAngles) {
    anglesRef.current = newAngles;
    setAngles(newAngles);
  }

  // isDragging only pauses the ambient loop for as long as a drag is actually in progress -- once
  // released, the idle drift resumes (from wherever the visitor left it, not a jump back to the
  // formula's absolute-time position). The readout itself is always visible now (request: "keep
  // showing the interactive values at all times") -- no more hasEverInteracted reveal-gate.
  const [isDragging, setIsDragging] = useState(false);

  // Real course IDs, keyed by the same title strings COURSES already uses -- lets the course
  // cards link straight to their own /courses/:id page instead of the generic catalog. Fetched
  // (not hardcoded) since IDs are a seed-load-order artifact, not a stable content identifier
  // (same reasoning as CourseIcons.jsx's own title-keyed lookup). GET /courses is public, so this
  // works for every visitor, logged in or not. Silently degrades to the catalog link below if it
  // fails -- never a dead link, just a less-specific destination until it resolves.
  const [courseIdByTitle, setCourseIdByTitle] = useState({});
  useEffect(() => {
    let cancelled = false;
    courseService
      .list()
      .then(({ courses }) => {
        if (cancelled) return;
        setCourseIdByTitle(Object.fromEntries(courses.map((course) => [course.title, course.id])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function handleHeroDrag(newAngles) {
    updateAngles(newAngles);
    setIsDragging(true);
  }

  function handleHeroDragEnd() {
    setIsDragging(false);
  }

  // Critique fix: the hero's drag interaction (the page's single biggest differentiator) had no
  // keyboard alternative at all -- a keyboard-only user got none of it, not just screen-reader
  // users (who are deliberately excluded via aria-hidden on the whole scene; see
  // LandingHeroVisual.jsx's own reasoning, unchanged here). Each arrow-key press is treated as a
  // discrete nudge, reusing the exact same handleHeroDrag/handleHeroDragEnd pair a mouse drag
  // uses, rather than a parallel code path -- immediately calling DragEnd after one press (not
  // holding isDragging) since a keypress has no natural "release" moment the way a mouse drag
  // does; the ambient idle animation resumes right after, same as it would after a mouse release.
  const HERO_KEYBOARD_STEP = Math.PI / 18; // 10 degrees per press
  function handleHeroKeyDown(event) {
    const { theta, phi } = anglesRef.current;
    let newAngles;
    switch (event.key) {
      case "ArrowUp":
        newAngles = { theta: clamp(theta - HERO_KEYBOARD_STEP, 0, Math.PI), phi };
        break;
      case "ArrowDown":
        newAngles = { theta: clamp(theta + HERO_KEYBOARD_STEP, 0, Math.PI), phi };
        break;
      case "ArrowLeft":
        newAngles = { theta, phi: (phi - HERO_KEYBOARD_STEP + 2 * Math.PI) % (2 * Math.PI) };
        break;
      case "ArrowRight":
        newAngles = { theta, phi: (phi + HERO_KEYBOARD_STEP) % (2 * Math.PI) };
        break;
      default:
        return;
    }
    event.preventDefault();
    handleHeroDrag(newAngles);
    handleHeroDragEnd();
  }

  useEffect(() => {
    // Reduced motion, no WebGL, or a drag actively in progress all mean "don't run the ambient
    // loop right now" -- mid-drag, the arrow is fully driven by the pointer via handleHeroDrag
    // instead.
    if (prefersReducedMotion || !webglAvailable || isDragging) return;

    let cancelled = false;
    let isPaused = document.hidden;
    // A single wireframe sphere + one arrow is cheap enough that frame budget was never really
    // the concern for "low-end devices" -- the actual cost of a perpetual rAF loop is battery/CPU
    // for a tab nobody's looking at, which this avoids regardless of device class.
    function handleVisibilityChange() {
      isPaused = document.hidden;
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Continuity, not a jump: resuming (after a drag release, or on first mount) anchors the
    // rotation at the CURRENT phi and solves for a breathing-phase offset so theta's sinusoid
    // starts exactly at the current theta too -- the arrow keeps drifting from where it visually
    // is, instead of snapping to wherever the old absolute-time formula would otherwise place it.
    const resumeStart = performance.now();
    const { theta: thetaAtResume, phi: phiAtResume } = anglesRef.current;
    const breathTAtResume = clamp((thetaAtResume - THETA_MIN) / (THETA_MAX - THETA_MIN), 0, 1);
    const breathPhaseOffset = Math.asin(clamp(2 * breathTAtResume - 1, -1, 1));

    function step(now) {
      if (cancelled) return;
      if (!isPaused) {
        const elapsed = now - resumeStart;
        const breathT =
          (Math.sin((elapsed / BREATH_PERIOD_MS) * 2 * Math.PI + breathPhaseOffset) + 1) / 2;
        updateAngles({
          theta: THETA_MIN + breathT * (THETA_MAX - THETA_MIN),
          phi: (phiAtResume + (elapsed / ROTATION_PERIOD_MS) * 2 * Math.PI) % (2 * Math.PI),
        });
      }
      requestAnimationFrame(step);
    }
    const frameId = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [prefersReducedMotion, webglAvailable, isDragging]);

  // Real numbers from the same physics module the lesson widget uses, not a decorative fake --
  // once someone drags the arrow they're reading the actual quantum-state probabilities for
  // wherever they left it. probabilityOf0 rounds cleanly; probabilityOf1 is derived as the
  // complement so the two always sum to exactly 100% (independent rounding could read 99/101).
  const probabilityOfZero = Math.round(probabilityOf0(angles.theta) * 100);
  const probabilityOfOne = 100 - probabilityOfZero;
  // theta/phi themselves, in degrees -- the literal spherical coordinates the drag is
  // manipulating, not just their derived probabilities.
  const thetaDegrees = Math.round((angles.theta * 180) / Math.PI);
  const phiDegrees = Math.round((angles.phi * 180) / Math.PI);

  return (
    <>
      {/* Critique finding: a keyboard user had to tab through the logo + 3 section links + Login +
          Start-learning (6 stops) before reaching any hero content, with no way to bypass it.
          Visually hidden until focused (the near-universal skip-link pattern) -- see
          .landing-page__skip-link in LandingPage.css. */}
      <a href="#landing-main-content" className="landing-page__skip-link">
        Skip to content
      </a>
      <LandingNavbar />
      <main className="landing-page" id="landing-main-content">
        <section className="landing-page__hero">
          <div className="landing-page__hero-panel">
            <div className="landing-page__hero-pattern" aria-hidden="true" />
            <div className="landing-page__hero-copy">
              <h1>See the qubit before you compute with it.</h1>
              <p className="landing-page__hero-tagline">
                That&apos;s not a diagram — it&apos;s a real quantum state. Drag the arrow and watch
                the numbers respond.
              </p>
              {/* Critique finding: the hero showed raw bra-ket/Greek notation (P(|0>), theta,
                  phi) on first paint, directly ahead of the Method section's own promise a few
                  scrolls down ("Formal notation comes later. The picture comes first") -- for a
                  visitor with no prior quantum background, that's notation before any picture-
                  first explanation exists. The numbers themselves stay (verified as the page's
                  strongest "real physics, not decorative" proof point) -- this line bridges the
                  contradiction instead of removing them, read by every visitor including screen
                  readers (the readout itself is aria-hidden, so this is the only place a
                  screen-reader user gets this reassurance at all). */}
              <p className="landing-page__hero-readout-caption">
                No notation to learn yet — the sphere is doing the explaining, not you.
              </p>
              {/* Moved here from beside the sphere -- reads as part of the pitch now, not an
                  overlay on the visual. Always visible (request: "keep showing the interactive
                  values at all times") -- shows the current static/idle-drift angles before any
                  interaction, then whatever the visitor drags to. aria-hidden: dragging the arrow
                  conveys no information a screen-reader user would be missing (a discoverable
                  easter egg, not a functional control -- the real Bloch sphere widget with full
                  keyboard/labelled controls lives in the lesson player). Only rendered when WebGL
                  is actually available -- no point showing live numbers next to a static
                  fallback image that can't be dragged. */}
              {webglAvailable && (
                <div className="landing-page__hero-readout" aria-hidden="true">
                  <p className="landing-page__hero-readout-line">
                    P(|0⟩) ≈ {probabilityOfZero}% · P(|1⟩) ≈ {probabilityOfOne}%
                  </p>
                  <p className="landing-page__hero-readout-line">
                    θ ≈ {thetaDegrees}° · φ ≈ {phiDegrees}°
                  </p>
                </div>
              )}
              <Link
                to="/signup"
                className="button button--primary landing-cta landing-glass-pill landing-page__hero-cta"
              >
                Start learning
              </Link>
              {/* Critique finding: none of the 4 "Start learning" CTAs on the page said anything
                  about cost or commitment -- right at the highest-stakes moment (the click that
                  leaves the page), a visitor had no idea what they were committing to. Once here,
                  not repeated at every CTA -- that would be the same repetitive-copy failure mode
                  already avoided for the CTAs themselves. */}
              <p className="landing-page__hero-cta-note">Free to start — no card required.</p>
            </div>
            <LandingHeroVisual
              webglAvailable={webglAvailable}
              theta={angles.theta}
              phi={angles.phi}
              onDrag={handleHeroDrag}
              onDragEnd={handleHeroDragEnd}
              onKeyDown={handleHeroKeyDown}
            />
          </div>
        </section>

        <RevealSection id="courses" className="landing-page__courses">
          <div className="landing-page__section-inner">
            <h2>Three courses, one core question each.</h2>
            <p className="landing-page__courses-lede">
              Pick whichever question pulls at you first — each course is a complete, self-contained
              path from the qubit itself to a real capstone result, not a fragment of a bigger
              track.
            </p>
            <div className="landing-page__course-grid">
              {COURSES.map((course, index) => (
                <Card
                  key={course.name}
                  as={Link}
                  to={
                    courseIdByTitle[course.name]
                      ? `/courses/${courseIdByTitle[course.name]}`
                      : "/courses"
                  }
                  className="landing-page__course-card"
                  style={{ transitionDelay: `${index * 70}ms` }}
                >
                  <div className="landing-page__course-card-heading">
                    <course.Icon className="landing-page__course-card-icon" />
                    <h3>{course.name}</h3>
                  </div>
                  <p className="landing-page__course-question">{course.coreQuestion}</p>
                  <p className="landing-page__course-stats">
                    {course.chapters} chapters · {course.lessons} lessons
                  </p>
                </Card>
              ))}
            </div>
          </div>
        </RevealSection>

        <RevealSection id="start-anywhere" className="landing-page__compare">
          <div className="landing-page__section-inner landing-page__compare-inner">
            <h2>Start with whichever question grabs you first.</h2>
            <p className="landing-page__compare-lede">
              Each course teaches the qubit fundamentals it needs from scratch. Nothing here assumes
              you&apos;ve taken one of the others first.
            </p>
            <ul className="landing-page__compare-list">
              {COURSES.map((course, index) => (
                <li
                  key={course.name}
                  className="landing-page__compare-row"
                  style={{ transitionDelay: `${index * 70}ms` }}
                >
                  <span className="landing-page__compare-name">{course.name}</span>
                  <span className="landing-page__compare-note">{course.entryNote}</span>
                </li>
              ))}
            </ul>
            {/* Critique fix: previously no conversion point existed anywhere between the hero and
                the final CTA band -- a visitor convinced here (right after seeing all 3 entry
                points) had to scroll all the way back up or down to act. One CTA, not one per
                section (that would be the repetitive-CTA-spam failure mode) -- this is the single
                most natural "I'm convinced" moment outside the hero/final band. */}
            <Link
              to="/signup"
              className="button button--primary landing-cta landing-glass-pill landing-page__compare-cta"
            >
              Start learning
            </Link>
          </div>
        </RevealSection>

        <RevealSection id="method" className="landing-page__method">
          <div className="landing-page__section-inner">
            <h2>Formal notation comes later. The picture comes first.</h2>
            <p>
              Every concept starts as something you can see and manipulate — a qubit as a literal
              arrow on a sphere, a gate as a rotation you watch happen — before any bra-ket notation
              appears. The same interactive widgets, including a real Bloch sphere, carry through
              all three courses, so the mental model you build in the first lesson keeps paying off
              in the last.
            </p>
            <p>
              XP and streaks are here, but they stay in the background. The thing being measured is
              whether you can explain a concept afterward, not how many screens you cleared.
            </p>
            <ul className="landing-page__method-list">
              <li>Real 3D simulations you manipulate directly, not static diagrams to memorize.</li>
              <li>
                Every question graded instantly, with a real second attempt, not just a final score.
              </li>
              <li>
                Six widgets — sphere, gates, measurement, and more — reused across all three
                courses.
              </li>
            </ul>
          </div>
        </RevealSection>

        {/* "Start learning" -- landing-glass-pill added (critique finding: this was the one CTA on
            the page still a plain solid rounded-rect while every other instance, nav/hero, is a
            glass pill -- same label/destination/color rendering as two different shapes read as
            inconsistent). The single dark surface on this otherwise light page: Pumpkin gets to
            run at full saturation exactly once, here, per the palette's own text-safe/decorative-
            only split (see LandingTheme.css, which already validates the color reads fine on
            --landing-dark-surface). */}
        <RevealSection className="landing-page__final-cta">
          <div className="landing-page__section-inner landing-page__final-cta-inner">
            <h2>Start with the first thing every course teaches: what a qubit actually is.</h2>
            <Link to="/signup" className="button button--primary landing-cta landing-glass-pill">
              Start learning
            </Link>
            <ul className="landing-page__final-cta-badges">
              <li>No prior physics required</li>
              <li>Real 3D quantum simulations</li>
              <li>Free to start</li>
            </ul>
          </div>
        </RevealSection>

        <footer className="landing-page__footer">
          <div className="landing-page__footer-top">
            <div className="landing-page__footer-brand">
              <LandingWordmark className="landing-page__footer-wordmark" />
              <p className="landing-page__footer-note">
                Quantum machine learning, algorithms, and hardware — taught visually first.
              </p>
            </div>
            <nav className="landing-page__footer-column" aria-label="Page sections">
              <h3>Learn</h3>
              <a href="#courses">Courses</a>
              <a href="#start-anywhere">Start anywhere</a>
              <a href="#method">How it works</a>
            </nav>
            <nav className="landing-page__footer-column" aria-label="Account">
              <h3>Account</h3>
              <Link to="/login">Log in</Link>
              <Link to="/signup">Sign up</Link>
            </nav>
            <nav className="landing-page__footer-column" aria-label="Legal">
              <h3>Legal</h3>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
            </nav>
          </div>
          <div className="landing-page__footer-bottom">
            <span>© {new Date().getFullYear()} Qubit — NUST</span>
          </div>
        </footer>
      </main>
    </>
  );
}
