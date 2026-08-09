import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { progressService } from "../services/progress.service.js";
import { cohortService } from "../services/cohort.service.js";
import { dashboardService } from "../services/dashboard.service.js";
import { DashboardPage } from "./DashboardPage.jsx";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../services/course.service.js", () => ({
  courseService: { list: vi.fn() },
}));
vi.mock("../services/progress.service.js", () => ({
  progressService: { listForUser: vi.fn() },
}));
vi.mock("../services/cohort.service.js", () => ({
  cohortService: {
    list: vi.fn(),
    regenerateJoinCode: vi.fn(),
    bulkEnrollStudents: vi.fn(),
    listMine: vi.fn(),
    leave: vi.fn(),
  },
}));
vi.mock("../services/dashboard.service.js", () => ({
  dashboardService: { getCompletion: vi.fn(), getLessonPacing: vi.fn() },
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sane default for every learner test -- individual tests override with their own cohort
  // fixtures where the cohort card itself is what's under test.
  cohortService.listMine.mockResolvedValue([]);
});

test("a learner sees a cross-course progress summary, not the course catalog's browse grid", async () => {
  useAuth.mockReturnValue({ user: { id: "u1", role: "learner" } });
  courseService.list.mockResolvedValue({
    courses: [
      { id: 8, title: "Quantum Computing Hardware" },
      { id: 9, title: "Quantum Machine Learning" },
      { id: 10, title: "Quantum Algorithms" },
    ],
  });
  progressService.listForUser.mockResolvedValue({
    progress: [
      { course_id: 8, xp: 120, current_streak: 3, completed_at: null },
      { course_id: 10, xp: 40, current_streak: 0, completed_at: null },
    ],
  });
  renderDashboard();

  // 160 (the real sum) only ever appears once, in the hero's own stat row -- distinct from
  // either individual course's own XP, which is what actually proves this is a sum, not a stray
  // echo.
  expect(await screen.findByText("160 XP earned")).toBeInTheDocument();
  expect(screen.getByText("2 courses started")).toBeInTheDocument();
  expect(screen.getByText("3-day best streak")).toBeInTheDocument();
  // The whole row is the link now (critique fix: a title-only link left the card's padding and
  // XP badge outside the real touch target). Its accessible name is a deliberate aria-label
  // (critique fix: without one, the anchor's name was every descendant text node concatenated
  // with no separation, e.g. "Quantum Computing Hardware120 XP3-day streak"), matching Course
  // Catalog's own "title -- status" pattern.
  expect(
    screen.getByRole("link", { name: "Quantum Computing Hardware — In progress, 120 XP, 3-day streak" })
  ).toHaveAttribute("href", "/courses/8");
  expect(within(screen.getByText("Quantum Computing Hardware").closest("li")).getByText("120 XP")).toBeInTheDocument();
  expect(within(screen.getByText("Quantum Algorithms").closest("li")).getByText("40 XP")).toBeInTheDocument();
  // Only courses with a real Progress row appear -- QML (id 9, no progress) is absent.
  expect(screen.queryByText("Quantum Machine Learning")).not.toBeInTheDocument();
  expect(progressService.listForUser).toHaveBeenCalledWith({ userId: "me" });
});

test("each course row and the hero stats render their icons", async () => {
  useAuth.mockReturnValue({ user: { id: "u1", role: "learner" } });
  courseService.list.mockResolvedValue({
    courses: [{ id: 8, title: "Quantum Computing Hardware" }],
  });
  progressService.listForUser.mockResolvedValue({
    progress: [{ course_id: 8, xp: 30, current_streak: 1, completed_at: null }],
  });
  const { container } = renderDashboard();

  await screen.findByRole("link", { name: /Quantum Computing Hardware/ });
  expect(container.querySelector(".dashboard__hero-stat svg")).toBeInTheDocument();
  expect(container.querySelector(".dashboard__row-icon")).toBeInTheDocument();
});

test("each row shows an explicit call-to-action matching its progress state", async () => {
  useAuth.mockReturnValue({ user: { id: "u1", role: "learner" } });
  courseService.list.mockResolvedValue({
    courses: [
      { id: 8, title: "Quantum Computing Hardware" },
      { id: 10, title: "Quantum Algorithms" },
    ],
  });
  progressService.listForUser.mockResolvedValue({
    progress: [
      { course_id: 8, xp: 120, current_streak: 3, completed_at: null },
      { course_id: 10, xp: 500, current_streak: 0, completed_at: "2026-01-01T00:00:00Z" },
    ],
  });
  renderDashboard();

  await screen.findByRole("link", { name: /Quantum Computing Hardware/ });
  expect(screen.getByText("Continue")).toBeInTheDocument();
  expect(screen.getByText("Review course")).toBeInTheDocument();
});

test("a course row's whole card is the clickable link, not just the title text", async () => {
  useAuth.mockReturnValue({ user: { id: "u1", role: "learner" } });
  courseService.list.mockResolvedValue({
    courses: [{ id: 8, title: "Quantum Computing Hardware" }],
  });
  progressService.listForUser.mockResolvedValue({
    progress: [{ course_id: 8, xp: 120, current_streak: 3, completed_at: null }],
  });
  renderDashboard();

  const link = await screen.findByRole("link", { name: /Quantum Computing Hardware/ });
  // The Card, not just the title span, must be inside the link -- otherwise only the title's
  // own line-box is the real touch target (the critique-confirmed bug).
  expect(link.querySelector(".card")).toBeInTheDocument();
  expect(link.querySelector(".xp-streak-badge")).toBeInTheDocument();
});

test("a learner with zero progress rows sees an empty state pointing at the catalog", async () => {
  useAuth.mockReturnValue({ user: { id: "u1", role: "learner" } });
  courseService.list.mockResolvedValue({ courses: [] });
  progressService.listForUser.mockResolvedValue({ progress: [] });
  renderDashboard();

  expect(await screen.findByText(/started any courses yet/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Browse courses" })).toHaveAttribute("href", "/courses");
});

// Phase 8D.
test("a learner sees no cohorts card at all when they haven't joined any", async () => {
  useAuth.mockReturnValue({ user: { id: "u1", role: "learner" } });
  courseService.list.mockResolvedValue({ courses: [] });
  progressService.listForUser.mockResolvedValue({ progress: [] });
  renderDashboard();

  await screen.findByText(/started any courses yet/);
  expect(screen.queryByText("Your cohorts")).not.toBeInTheDocument();
});

test("a learner sees their joined cohorts and can leave one", async () => {
  const user = userEvent.setup();
  useAuth.mockReturnValue({ user: { id: "u1", role: "learner" } });
  courseService.list.mockResolvedValue({ courses: [] });
  progressService.listForUser.mockResolvedValue({ progress: [] });
  cohortService.listMine.mockResolvedValue([
    { id: 1, cohort_id: 5, cohort_name: "Quantum 101" },
    { id: 2, cohort_id: 6, cohort_name: "Advanced Circuits" },
  ]);
  cohortService.leave.mockResolvedValue({ id: 1, status: "removed" });
  renderDashboard();

  expect(await screen.findByText("Your cohorts")).toBeInTheDocument();
  expect(screen.getByText("Quantum 101")).toBeInTheDocument();
  expect(screen.getByText("Advanced Circuits")).toBeInTheDocument();

  const row = screen.getByText("Quantum 101").closest("li");
  await user.click(within(row).getByRole("button", { name: "Leave" }));

  expect(cohortService.leave).toHaveBeenCalledWith(5);
  await screen.findByText("Advanced Circuits");
  expect(screen.queryByText("Quantum 101")).not.toBeInTheDocument();
});

test("a failed leave shows an error banner and keeps the cohort in the list", async () => {
  const user = userEvent.setup();
  useAuth.mockReturnValue({ user: { id: "u1", role: "learner" } });
  courseService.list.mockResolvedValue({ courses: [] });
  progressService.listForUser.mockResolvedValue({ progress: [] });
  cohortService.listMine.mockResolvedValue([{ id: 1, cohort_id: 5, cohort_name: "Quantum 101" }]);
  cohortService.leave.mockRejectedValue({
    response: { data: { error: { code: "NOT_FOUND", message: "No active enrollment found." } } },
  });
  renderDashboard();

  await screen.findByText("Quantum 101");
  await user.click(screen.getByRole("button", { name: "Leave" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("No active enrollment found.");
  expect(screen.getByText("Quantum 101")).toBeInTheDocument();
});

test("an instructor with zero cohorts sees an empty state explaining cohorts are admin-provisioned, not a bare 'not found'", async () => {
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  cohortService.list.mockResolvedValue({ cohorts: [] });
  const { container } = renderDashboard();

  expect(await screen.findByText("No cohorts assigned yet")).toBeInTheDocument();
  expect(screen.getByText(/provisioned directly by an admin/)).toBeInTheDocument();
  expect(dashboardService.getCompletion).not.toHaveBeenCalled();
  // This is the entire admin experience of this screen (GET /cohorts is always scoped to the
  // caller's own id, and an admin owns none), not a rare edge case -- it gets the same hero
  // treatment as every other loaded state, not the bare heading-plus-paragraph this used to be.
  expect(container.querySelector(".dashboard__hero")).toBeInTheDocument();
  expect(
    container.querySelector(".dashboard__empty-cta-text")?.contains(
      container.querySelector(".dashboard__empty-cta-icon")
    )
  ).toBe(true);
});

test("an instructor with exactly one cohort skips the picker and loads its completion + pacing data directly", async () => {
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  cohortService.list.mockResolvedValue({
    cohorts: [{ id: 5, name: "Fall Cohort", join_code: "ABC123DE" }],
  });
  dashboardService.getCompletion.mockResolvedValue({
    courses: [
      {
        courseId: 2,
        courseTitle: "Quantum Algorithms",
        totalStudents: 24,
        completed: 0,
        inProgress: 13,
        notStarted: 11,
        averageXp: 340,
      },
    ],
  });
  dashboardService.getLessonPacing.mockResolvedValue({
    lessons: [
      {
        lessonId: 14,
        lessonTitle: "Superconducting Qubits",
        averageInterQuestionSeconds: 142,
        sampleSize: 18,
        note: "Approximate — measures time between consecutive question attempts only. Does not capture time on screens without questions, or time before the first question in a lesson.",
      },
    ],
  });
  renderDashboard();

  expect(await screen.findByText("Quantum Algorithms")).toBeInTheDocument();
  expect(screen.queryByLabelText("Cohort")).not.toBeInTheDocument();
  expect(dashboardService.getCompletion).toHaveBeenCalledWith(5);
  expect(dashboardService.getLessonPacing).toHaveBeenCalledWith(5);
  // Hero stats mirror the learner view's own orienting numbers -- shown before the per-course
  // breakdown, instead of diving straight into card 1 of N (critique finding).
  expect(screen.getByText("24 students enrolled")).toBeInTheDocument();
  expect(screen.getByText("1 course")).toBeInTheDocument();
  expect(screen.getByText("13 in progress · 11 not started · 0 completed · 340 avg XP")).toBeInTheDocument();
  // A full bar here means "everyone started," not "everyone finished" -- this visible caption
  // (not just the ProgressBar's aria-label) is what tells a sighted user that.
  expect(screen.getByText("Engagement (started or completed)")).toBeInTheDocument();

  // The note field renders verbatim -- never dropped or paraphrased.
  expect(
    screen.getByText(
      "Approximate — measures time between consecutive question attempts only. Does not capture time on screens without questions, or time before the first question in a lesson."
    )
  ).toBeInTheDocument();
});

test("the headline stat singularizes correctly for exactly one student and one course", async () => {
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  cohortService.list.mockResolvedValue({
    cohorts: [{ id: 5, name: "Fall Cohort", join_code: "ABC123DE" }],
  });
  dashboardService.getCompletion.mockResolvedValue({
    courses: [
      {
        courseId: 9,
        courseTitle: "Quantum Machine Learning",
        totalStudents: 1,
        completed: 0,
        inProgress: 1,
        notStarted: 0,
        averageXp: 20,
      },
    ],
  });
  dashboardService.getLessonPacing.mockResolvedValue({ lessons: [] });
  renderDashboard();

  expect(await screen.findByText("1 student enrolled")).toBeInTheDocument();
  expect(screen.getByText("1 course")).toBeInTheDocument();
});

test("an instructor with multiple cohorts sees a picker, and switching cohorts re-fetches both endpoints", async () => {
  const user = userEvent.setup();
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  cohortService.list.mockResolvedValue({
    cohorts: [
      { id: 5, name: "Fall Cohort" },
      { id: 6, name: "Spring Cohort" },
    ],
  });
  dashboardService.getCompletion.mockResolvedValue({ courses: [] });
  dashboardService.getLessonPacing.mockResolvedValue({ lessons: [] });
  renderDashboard();

  await screen.findByLabelText("Cohort");
  expect(dashboardService.getCompletion).toHaveBeenCalledWith(5);

  await user.selectOptions(screen.getByLabelText("Cohort"), "6");
  expect(dashboardService.getCompletion).toHaveBeenCalledWith(6);
  expect(dashboardService.getLessonPacing).toHaveBeenCalledWith(6);
});

test("shows the selected cohort's join code and copies an invite link to the clipboard", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue();
  // jsdom's navigator.clipboard is a getter-only property -- Object.assign can't touch it, so
  // this replaces the property descriptor outright instead.
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  cohortService.list.mockResolvedValue({
    cohorts: [{ id: 5, name: "Fall Cohort", join_code: "ABC123DE" }],
  });
  dashboardService.getCompletion.mockResolvedValue({ courses: [] });
  dashboardService.getLessonPacing.mockResolvedValue({ lessons: [] });
  renderDashboard();

  expect(await screen.findByText("ABC123DE")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Copy invite link" }));

  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/join/ABC123DE"));
  expect(await screen.findByRole("button", { name: "Copied!" })).toBeInTheDocument();
});

test("a denied clipboard permission shows a fallback message instead of failing silently", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockRejectedValue(new Error("Write permission denied."));
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  cohortService.list.mockResolvedValue({
    cohorts: [{ id: 5, name: "Fall Cohort", join_code: "ABC123DE" }],
  });
  dashboardService.getCompletion.mockResolvedValue({ courses: [] });
  dashboardService.getLessonPacing.mockResolvedValue({ lessons: [] });
  renderDashboard();

  await screen.findByText("ABC123DE");
  await user.click(screen.getByRole("button", { name: "Copy invite link" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not copy automatically -- copy the code above instead."
  );
  expect(screen.queryByRole("button", { name: "Copied!" })).not.toBeInTheDocument();
});

test("regenerating the join code replaces the displayed code with the new one", async () => {
  const user = userEvent.setup();
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  cohortService.list.mockResolvedValue({
    cohorts: [{ id: 5, name: "Fall Cohort", join_code: "OLD12345" }],
  });
  cohortService.regenerateJoinCode.mockResolvedValue({
    id: 5,
    name: "Fall Cohort",
    join_code: "NEW98765",
  });
  dashboardService.getCompletion.mockResolvedValue({ courses: [] });
  dashboardService.getLessonPacing.mockResolvedValue({ lessons: [] });
  renderDashboard();

  await screen.findByText("OLD12345");
  await user.click(screen.getByRole("button", { name: "Regenerate" }));

  expect(cohortService.regenerateJoinCode).toHaveBeenCalledWith(5);
  expect(await screen.findByText("NEW98765")).toBeInTheDocument();
  expect(screen.queryByText("OLD12345")).not.toBeInTheDocument();
});

test("bulk-enrolling by email shows a per-row result for each submitted address", async () => {
  const user = userEvent.setup();
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  cohortService.list.mockResolvedValue({
    cohorts: [{ id: 5, name: "Fall Cohort", join_code: "ABC123DE" }],
  });
  cohortService.bulkEnrollStudents.mockResolvedValue([
    { email: "a@example.com", status: "enrolled" },
    { email: "b@example.com", status: "failed", reason: "No account found for this email." },
  ]);
  dashboardService.getCompletion.mockResolvedValue({ courses: [] });
  dashboardService.getLessonPacing.mockResolvedValue({ lessons: [] });
  renderDashboard();

  await screen.findByText("ABC123DE");
  await user.type(
    screen.getByLabelText("Or add students by email"),
    "a@example.com\nb@example.com"
  );
  await user.click(screen.getByRole("button", { name: "Add students" }));

  expect(cohortService.bulkEnrollStudents).toHaveBeenCalledWith(5, [
    "a@example.com",
    "b@example.com",
  ]);
  expect(await screen.findByText(/a@example.com.*Added/)).toBeInTheDocument();
  expect(
    screen.getByText(/b@example.com.*No account found for this email\./)
  ).toBeInTheDocument();
});

// Bug fix: admin used to fall into InstructorDashboard, which immediately calls
// cohortService.list() -- but GET /cohorts is backend-restricted to role "instructor" specifically
// (cohort.routes.js), not "instructor or admin" like every other cohort route. An admin account
// hit a hard 403 error banner here every time, never actually reaching any empty-cohorts state.
// Admin now gets its own dedicated branch that never calls cohortService at all.
test("an admin sees a dedicated dashboard, not the instructor's cohort-scoped one", async () => {
  useAuth.mockReturnValue({ user: { id: "a1", role: "admin" } });
  courseService.list.mockResolvedValue({
    courses: [
      { id: 8, title: "Quantum Computing Hardware" },
      { id: 9, title: "Quantum Machine Learning" },
      { id: 10, title: "Quantum Algorithms" },
    ],
  });
  renderDashboard();

  expect(await screen.findByText("Cohort reporting is scoped to instructors")).toBeInTheDocument();
  expect(screen.getByText("3 courses in the catalog")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Browse courses" })).toHaveAttribute("href", "/courses");
  // Phase 7C.1: the one thing an admin genuinely can manage from the UI now.
  expect(screen.getByRole("link", { name: "Manage users" })).toHaveAttribute(
    "href",
    "/admin/users"
  );
  // The actual bug: this must never call the instructor-only cohort endpoint at all.
  expect(cohortService.list).not.toHaveBeenCalled();
});

test("an admin dashboard still renders correctly if the course-count fetch fails", async () => {
  useAuth.mockReturnValue({ user: { id: "a1", role: "admin" } });
  courseService.list.mockRejectedValue(new Error("network down"));
  renderDashboard();

  expect(await screen.findByText("Cohort reporting is scoped to instructors")).toBeInTheDocument();
  expect(screen.queryByText(/courses in the catalog/)).not.toBeInTheDocument();
});
