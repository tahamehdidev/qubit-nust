import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { lessonService } from "../services/lesson.service.js";
import { progressService } from "../services/progress.service.js";
import { CourseDetailPage } from "./CourseDetailPage.jsx";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../services/course.service.js", () => ({
  courseService: { getById: vi.fn() },
}));
vi.mock("../services/lesson.service.js", () => ({
  lessonService: { listForChapter: vi.fn() },
}));
vi.mock("../services/progress.service.js", () => ({
  progressService: { listForUser: vi.fn() },
}));

const COURSE = {
  id: 9,
  title: "Quantum Machine Learning",
  narrative: "QML is a genuinely different computational paradigm.",
  chapters: [
    { id: 100, title: "Why Quantum, Why Now" },
    { id: 101, title: "The Quantum Bit, Visually" },
  ],
};

const LESSONS_BY_CHAPTER = {
  100: [
    { id: 1000, title: "Classical vs Quantum" },
    { id: 1001, title: "Why This Matters" },
  ],
  101: [{ id: 1002, title: "Seeing the Qubit" }],
};

function mockLessonsForChapters() {
  lessonService.listForChapter.mockImplementation((chapterId) =>
    Promise.resolve({ lessons: LESSONS_BY_CHAPTER[chapterId] ?? [], pagination: {} })
  );
}

function renderDetail(courseId = "9") {
  return render(
    <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
      <Routes>
        <Route path="/courses/:courseId" element={<CourseDetailPage />} />
        <Route path="/courses" element={<div>Course catalog</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Every existing test in this file predates Phase 5.5's public-preview branching and exercises
  // the authenticated experience (lesson links, no signup CTA) -- default to that so none of them
  // need touching; the anonymous-specific tests below override this explicitly.
  useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
  progressService.listForUser.mockResolvedValue({ progress: [], pagination: {} });
});

test("fetches the course, then fetches every chapter's lessons in parallel", async () => {
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  renderDetail();

  expect(
    await screen.findByRole("heading", { name: "Quantum Machine Learning" })
  ).toBeInTheDocument();
  expect(courseService.getById).toHaveBeenCalledWith("9");
  expect(lessonService.listForChapter).toHaveBeenCalledWith(100);
  expect(lessonService.listForChapter).toHaveBeenCalledWith(101);
  expect(lessonService.listForChapter).toHaveBeenCalledTimes(2);
  expect(
    screen.getByText("QML is a genuinely different computational paradigm.")
  ).toBeInTheDocument();
});

// Reinvention pass: every chapter starts expanded now (was just the first) -- the syllabus is the
// whole point of this page, doubly so for an anonymous visitor deciding whether to sign up.
test("every chapter is expanded by default", async () => {
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  expect(screen.getByRole("button", { name: /Why Quantum, Why Now/ })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  expect(screen.getByRole("button", { name: /The Quantum Bit, Visually/ })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  expect(screen.getByRole("link", { name: "Classical vs Quantum" })).toHaveAttribute(
    "href",
    "/lessons/1000"
  );
  expect(screen.getByRole("link", { name: "Seeing the Qubit" })).toHaveAttribute(
    "href",
    "/lessons/1002"
  );
});

test("the hero shows a real chapter/lesson count, not just title and narrative", async () => {
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  expect(screen.getByText("2 chapters")).toBeInTheDocument();
  expect(screen.getByText("3 lessons")).toBeInTheDocument(); // 2 + 1 across both chapters
});

test("anonymous: each locked lesson shows a lock icon alongside the muted title", async () => {
  useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  const { container } = renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  expect(screen.getByText("Classical vs Quantum")).toBeInTheDocument();
  expect(container.querySelectorAll(".course-detail__lesson-lock")).toHaveLength(3);
});

test("shows each chapter's lesson count", async () => {
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  expect(screen.getByText("2 lessons")).toBeInTheDocument();
  expect(screen.getByText("1 lesson")).toBeInTheDocument(); // singular
});

test("clicking an expanded chapter collapses it without collapsing the other one", async () => {
  const user = userEvent.setup();
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  await user.click(screen.getByRole("button", { name: /The Quantum Bit, Visually/ }));

  expect(screen.getByRole("button", { name: /The Quantum Bit, Visually/ })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  expect(screen.queryByRole("link", { name: "Seeing the Qubit" })).not.toBeInTheDocument();
  // The other chapter is untouched -- independent toggles, not a single-open accordion.
  expect(screen.getByRole("button", { name: /Why Quantum, Why Now/ })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  expect(screen.getByRole("link", { name: "Classical vs Quantum" })).toBeInTheDocument();
});

test("clicking an expanded chapter collapses it again", async () => {
  const user = userEvent.setup();
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  await user.click(screen.getByRole("button", { name: /Why Quantum, Why Now/ }));

  expect(screen.getByRole("button", { name: /Why Quantum, Why Now/ })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  expect(screen.queryByRole("link", { name: "Classical vs Quantum" })).not.toBeInTheDocument();
});

test("chapters are numbered in order, zero-padded to two digits", async () => {
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  expect(screen.getByText("01")).toBeInTheDocument();
  expect(screen.getByText("02")).toBeInTheDocument();
});

test("chapter titles are real headings, so screen readers can jump between them", async () => {
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  expect(screen.getByRole("heading", { name: /Why Quantum, Why Now/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /The Quantum Bit, Visually/ })).toBeInTheDocument();
});

// Critique fix: with no aria-label, JSX's own whitespace-stripping between the index/title/count
// spans left the accessible name as one run-on string with no word boundaries
// ("...Physically3 lessons") -- a screen reader announced number/letter seams instead of a
// scannable name.
test("each chapter header's accessible name is a scannable 'Chapter N: Title, X lessons', not run-on concatenated text", async () => {
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  expect(
    screen.getByRole("button", { name: "Chapter 1: Why Quantum, Why Now, 2 lessons" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Chapter 2: The Quantum Bit, Visually, 1 lesson" })
  ).toBeInTheDocument();
});

// Every chapter starts expanded now, so the toggle itself starts in its "Collapse all" state --
// this test exercises the full round trip (collapse everything, then re-expand everything).
test("'Collapse all' closes every chapter at once, then becomes 'Expand all'", async () => {
  const user = userEvent.setup();
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Collapse all" }));

  expect(screen.getByRole("button", { name: /Why Quantum, Why Now/ })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  expect(screen.getByRole("button", { name: /The Quantum Bit, Visually/ })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  expect(screen.queryByRole("link", { name: "Seeing the Qubit" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Expand all" }));

  expect(screen.getByRole("button", { name: /Why Quantum, Why Now/ })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  expect(screen.getByRole("button", { name: /The Quantum Bit, Visually/ })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  expect(screen.getByRole("link", { name: "Seeing the Qubit" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Collapse all" })).toBeInTheDocument();
});

test("a course with zero chapters shows a distinct empty state, not an empty chapter list", async () => {
  courseService.getById.mockResolvedValue({ ...COURSE, chapters: [] });
  renderDetail();

  expect(
    await screen.findByText("This course doesn’t have any chapters yet — check back soon.")
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Expand all" })).not.toBeInTheDocument();
});

test("a nonexistent course shows a 'not found' message with a link back to the catalog, no retry button", async () => {
  courseService.getById.mockRejectedValue({
    response: { data: { error: { code: "NOT_FOUND", message: "Course not found." } } },
  });
  renderDetail("999999");

  expect(await screen.findByText("Course not found.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to courses" })).toHaveAttribute("href", "/courses");
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
});

test("a generic fetch failure shows the error banner with a retry action that re-fetches", async () => {
  const user = userEvent.setup();
  courseService.getById.mockRejectedValueOnce(new Error("network down"));
  renderDetail();

  const banner = await screen.findByRole("alert");
  expect(banner).toHaveTextContent("Could not reach the server. Check your connection.");

  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(
    await screen.findByRole("heading", { name: "Quantum Machine Learning" })
  ).toBeInTheDocument();
});

// Phase 5.5: this page is now reachable without a session, so it must never assume req.user
// exists -- lesson titles are the free preview, the lessons themselves are not.
test("anonymous: lesson titles render as plain text, not links, and a signup CTA appears", async () => {
  useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  expect(screen.getByText("Classical vs Quantum")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Classical vs Quantum" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign up free" })).toHaveAttribute("href", "/signup");
  // progressService is never called at all for an anonymous visitor -- calling it would just be
  // a request that's certain to 401.
  expect(progressService.listForUser).not.toHaveBeenCalled();
});

test("anonymous: no progress strip renders (there's nothing to show)", async () => {
  useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  const { container } = renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  expect(container.querySelector(".course-detail__progress-strip")).not.toBeInTheDocument();
});

test("authenticated with an existing Progress row: shows the XP/streak strip, no signup CTA", async () => {
  useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
  courseService.getById.mockResolvedValue(COURSE);
  mockLessonsForChapters();
  progressService.listForUser.mockResolvedValue({
    progress: [{ course_id: 9, xp: 40, current_streak: 2, completed_at: null }],
  });
  renderDetail();
  await screen.findByRole("heading", { name: "Quantum Machine Learning" });

  expect(await screen.findByText("40 XP")).toBeInTheDocument();
  expect(screen.getByText("2-day streak")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Sign up free" })).not.toBeInTheDocument();
  expect(progressService.listForUser).toHaveBeenCalledWith({ userId: "me", courseId: 9 });
});

// While auth state is still resolving (the silent-refresh-on-mount check on every page load),
// the page must not commit to either branch -- same reasoning as AuthenticatedLayout's own nav.
test("while auth state is loading, the skeleton shows instead of either the anonymous or authenticated branch", () => {
  useAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
  courseService.getById.mockResolvedValue(COURSE);
  renderDetail();

  expect(
    screen.queryByRole("heading", { name: "Quantum Machine Learning" })
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Sign up free" })).not.toBeInTheDocument();
  expect(courseService.getById).not.toHaveBeenCalled();
});
