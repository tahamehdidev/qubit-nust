import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { progressService } from "../services/progress.service.js";
import { CourseCatalogPage, truncateAtWordBoundary } from "./CourseCatalogPage.jsx";

// The real seeded Hardware narrative -- what actually confirmed the mid-word truncation bug
// live (the old CSS-only clamp cut this to "...superconducting mi" on the real page).
const LONG_NARRATIVE =
  "Building a useful quantum computer requires engineering a physical system — most commonly " +
  "a superconducting transmon qubit — that can be cooled to near absolute zero, controlled by " +
  "precisely shaped microwave pulses.";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../services/course.service.js", () => ({
  courseService: { list: vi.fn() },
}));
vi.mock("../services/progress.service.js", () => ({
  progressService: { listForUser: vi.fn() },
}));

const COURSES = [
  {
    id: 8,
    title: "Quantum Computing Hardware",
    narrative: "Building a useful quantum computer...",
  },
  { id: 9, title: "Quantum Machine Learning", narrative: "QML is a genuinely different..." },
  { id: 10, title: "Quantum Algorithms", narrative: "Quantum algorithms exploit..." },
];

function renderCatalog() {
  return render(
    <BrowserRouter>
      <CourseCatalogPage />
    </BrowserRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Every existing test in this file predates the auth-aware hero/CTA work and exercises the
  // authenticated experience (no signup nudge) -- default to that so none of them need updating
  // just to keep passing; tests that specifically need the anonymous branch override this.
  useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
});

test("shows skeleton placeholders while the initial fetch is in flight", () => {
  courseService.list.mockReturnValue(new Promise(() => {})); // never resolves
  progressService.listForUser.mockReturnValue(new Promise(() => {}));
  const { container } = renderCatalog();

  expect(container.querySelectorAll(".course-catalog__card--skeleton")).toHaveLength(3);
});

test("renders every course with its narrative once loaded", async () => {
  courseService.list.mockResolvedValue({ courses: COURSES, pagination: {} });
  progressService.listForUser.mockResolvedValue({ progress: [], pagination: {} });
  renderCatalog();

  expect(
    await screen.findByRole("heading", { name: "Quantum Machine Learning" })
  ).toBeInTheDocument();
  expect(screen.getByText("Building a useful quantum computer...")).toBeInTheDocument();
  expect(progressService.listForUser).toHaveBeenCalledWith({ userId: "me" });
});

test("each card renders its matching course icon", async () => {
  courseService.list.mockResolvedValue({ courses: COURSES, pagination: {} });
  progressService.listForUser.mockResolvedValue({ progress: [], pagination: {} });
  const { container } = renderCatalog();

  await screen.findByRole("heading", { name: "Quantum Machine Learning" });
  expect(container.querySelectorAll(".course-catalog__icon")).toHaveLength(COURSES.length);
});

test("a course with no progress row shows 'Not started'", async () => {
  courseService.list.mockResolvedValue({ courses: [COURSES[0]], pagination: {} });
  progressService.listForUser.mockResolvedValue({ progress: [], pagination: {} });
  renderCatalog();

  expect(await screen.findByText("Not started")).toBeInTheDocument();
});

test("a course with an in-progress Progress row shows the XP/streak badge", async () => {
  courseService.list.mockResolvedValue({ courses: [COURSES[0]], pagination: {} });
  progressService.listForUser.mockResolvedValue({
    progress: [{ course_id: 8, xp: 120, current_streak: 3, completed_at: null }],
    pagination: {},
  });
  renderCatalog();

  expect(await screen.findByText("120 XP")).toBeInTheDocument();
  expect(screen.getByText("3-day streak")).toBeInTheDocument();
  expect(screen.queryByText("Not started")).not.toBeInTheDocument();
});

// Progress.completed_at is never actually set by any code in this codebase yet (see the
// component's own comment) -- this proves the wiring is correct now, so it's ready the moment a
// future milestone adds real completion-detection logic, the same way dashboard.service.js's
// completion query is unit-provably correct despite always reading 0 in practice today.
test("a course with completed_at set shows Completed, even though nothing sets it yet in practice", async () => {
  courseService.list.mockResolvedValue({ courses: [COURSES[0]], pagination: {} });
  progressService.listForUser.mockResolvedValue({
    progress: [{ course_id: 8, xp: 500, current_streak: 0, completed_at: "2026-01-01T00:00:00Z" }],
    pagination: {},
  });
  renderCatalog();

  expect(await screen.findByText("Completed")).toBeInTheDocument();
  expect(screen.queryByText("500 XP")).not.toBeInTheDocument();
});

test("only a genuinely in-progress course (not not-started, not completed) gets the accent border", async () => {
  courseService.list.mockResolvedValue({ courses: COURSES, pagination: {} });
  progressService.listForUser.mockResolvedValue({
    progress: [{ course_id: 9, xp: 10, current_streak: 0, completed_at: null }],
    pagination: {},
  });
  const { container } = renderCatalog();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  const accented = container.querySelectorAll(".course-catalog__card--in-progress");
  expect(accented).toHaveLength(1);
  expect(accented[0].querySelector("h2").textContent).toBe("Quantum Machine Learning");
});

test("a completed course does not get the in-progress accent border", async () => {
  courseService.list.mockResolvedValue({ courses: [COURSES[0]], pagination: {} });
  progressService.listForUser.mockResolvedValue({
    progress: [{ course_id: 8, xp: 500, current_streak: 0, completed_at: "2026-01-01T00:00:00Z" }],
    pagination: {},
  });
  const { container } = renderCatalog();
  await screen.findByText("Completed");

  expect(container.querySelectorAll(".course-catalog__card--in-progress")).toHaveLength(0);
});

test("truncateAtWordBoundary never cuts mid-word, and leaves short text untouched", () => {
  expect(truncateAtWordBoundary("short text", 110)).toBe("short text");

  const truncated = truncateAtWordBoundary(LONG_NARRATIVE, 110);
  expect(truncated.length).toBeLessThan(LONG_NARRATIVE.length);
  expect(truncated.endsWith("…")).toBe(true);
  // The character right before the ellipsis must end a real word, not sit mid-word -- i.e. the
  // text minus the ellipsis, re-joined with a space, must appear verbatim as a prefix of the
  // original (proving nothing was sliced out of the middle of a word).
  const withoutEllipsis = truncated.slice(0, -1);
  expect(LONG_NARRATIVE.startsWith(withoutEllipsis)).toBe(true);
  expect(LONG_NARRATIVE[withoutEllipsis.length]).toBe(" ");
});

test("a long real narrative renders truncated at a word boundary, not the full string", async () => {
  courseService.list.mockResolvedValue({
    courses: [{ id: 8, title: "Quantum Computing Hardware", narrative: LONG_NARRATIVE }],
    pagination: {},
  });
  progressService.listForUser.mockResolvedValue({ progress: [], pagination: {} });
  renderCatalog();

  await screen.findByRole("heading", { name: "Quantum Computing Hardware" });
  expect(screen.queryByText(LONG_NARRATIVE)).not.toBeInTheDocument();
  const narrative = document.querySelector(".course-catalog__narrative");
  expect(narrative.textContent.endsWith("…")).toBe(true);
});

test("each card links to its own course detail page", async () => {
  courseService.list.mockResolvedValue({ courses: COURSES, pagination: {} });
  progressService.listForUser.mockResolvedValue({ progress: [], pagination: {} });
  renderCatalog();

  await screen.findByRole("heading", { name: "Quantum Algorithms" });
  expect(screen.getByRole("link", { name: /Quantum Algorithms/ })).toHaveAttribute(
    "href",
    "/courses/10"
  );
});

// Critique fix: with no aria-label, the anchor's accessible name was every descendant text node
// concatenated with no separation -- title, full narrative, and status running together as one
// undifferentiated block for a screen-reader user navigating by link.
test("each card's accessible name is a scannable 'title -- status', not the whole card's concatenated text", async () => {
  courseService.list.mockResolvedValue({ courses: [COURSES[0]], pagination: {} });
  progressService.listForUser.mockResolvedValue({
    progress: [{ course_id: 8, xp: 40, current_streak: 1, completed_at: null }],
    pagination: {},
  });
  renderCatalog();

  expect(
    await screen.findByRole("link", { name: "Quantum Computing Hardware — In progress, 40 XP" })
  ).toBeInTheDocument();
});

// Critique fix: courses and progress used to be fetched via a single Promise.all, so a
// non-critical progress-service failure blanked the entire catalog with a full-page error --
// denying the primary task (browse and pick a course) over a secondary enhancement (the XP
// status slot).
test("a progress-fetch failure still renders the catalog, degrading every card to 'Not started'", async () => {
  courseService.list.mockResolvedValue({ courses: COURSES, pagination: {} });
  progressService.listForUser.mockRejectedValue(new Error("progress service down"));
  renderCatalog();

  expect(await screen.findByRole("heading", { name: "Quantum Algorithms" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getAllByText("Not started")).toHaveLength(3);
});

test("zero courses shows a distinct empty state, not an empty grid", async () => {
  courseService.list.mockResolvedValue({ courses: [], pagination: {} });
  progressService.listForUser.mockResolvedValue({ progress: [], pagination: {} });
  const { container } = renderCatalog();

  expect(
    await screen.findByText("No courses are available yet — check back soon.")
  ).toBeInTheDocument();
  expect(container.querySelector(".course-catalog__grid")).not.toBeInTheDocument();
});

test("a fetch failure shows the error banner with a retry action that re-fetches", async () => {
  const user = userEvent.setup();
  courseService.list.mockRejectedValueOnce(new Error("network down"));
  progressService.listForUser.mockResolvedValue({ progress: [], pagination: {} });
  renderCatalog();

  const banner = await screen.findByRole("alert");
  expect(banner).toHaveTextContent("Could not reach the server. Check your connection.");

  courseService.list.mockResolvedValue({ courses: COURSES, pagination: {} });
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByRole("heading", { name: "Quantum Algorithms" })).toBeInTheDocument();
});

test("the hero shows the course count and, once authenticated progress loads, XP and in-progress stats", async () => {
  courseService.list.mockResolvedValue({ courses: COURSES, pagination: {} });
  progressService.listForUser.mockResolvedValue({
    progress: [
      { course_id: 8, xp: 40, current_streak: 1, completed_at: null },
      { course_id: 9, xp: 60, current_streak: 0, completed_at: null },
    ],
    pagination: {},
  });
  renderCatalog();

  expect(await screen.findByText("3 courses")).toBeInTheDocument();
  expect(screen.getByText("2 in progress")).toBeInTheDocument();
  expect(screen.getByText("100 XP earned")).toBeInTheDocument();
});

test("an anonymous visitor sees a signup CTA and no XP/in-progress hero stats", async () => {
  useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
  courseService.list.mockResolvedValue({ courses: COURSES, pagination: {} });
  renderCatalog();

  expect(await screen.findByText("3 courses")).toBeInTheDocument();
  expect(screen.queryByText(/in progress/)).not.toBeInTheDocument();
  expect(screen.queryByText(/XP earned/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign up free" })).toHaveAttribute("href", "/signup");
});

test("while auth is still resolving, neither the authenticated stats nor the signup CTA render", () => {
  useAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
  courseService.list.mockReturnValue(new Promise(() => {}));
  progressService.listForUser.mockReturnValue(new Promise(() => {}));
  renderCatalog();

  expect(screen.queryByRole("link", { name: "Sign up free" })).not.toBeInTheDocument();
});

test("each card shows an explicit call-to-action matching its progress state", async () => {
  courseService.list.mockResolvedValue({ courses: COURSES, pagination: {} });
  progressService.listForUser.mockResolvedValue({
    progress: [
      { course_id: 8, xp: 40, current_streak: 1, completed_at: null },
      { course_id: 9, xp: 500, current_streak: 0, completed_at: "2026-01-01T00:00:00Z" },
    ],
    pagination: {},
  });
  renderCatalog();

  await screen.findByRole("heading", { name: "Quantum Algorithms" });
  expect(screen.getByText("Continue")).toBeInTheDocument();
  expect(screen.getByText("Review course")).toBeInTheDocument();
  expect(screen.getByText("Start course")).toBeInTheDocument();
});
