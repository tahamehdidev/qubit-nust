import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { cohortService } from "../services/cohort.service.js";
import { courseService } from "../services/course.service.js";
import { progressService } from "../services/progress.service.js";
import { CohortDetailPage } from "./CohortDetailPage.jsx";

vi.mock("../services/cohort.service.js", () => ({
  cohortService: {
    getById: vi.fn(),
    listStudents: vi.fn(),
    update: vi.fn(),
    regenerateJoinCode: vi.fn(),
    bulkEnrollStudents: vi.fn(),
    removeStudent: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock("../services/course.service.js", () => ({
  courseService: { list: vi.fn() },
}));
vi.mock("../services/progress.service.js", () => ({
  progressService: { listForUser: vi.fn() },
}));

const COHORT = { id: 5, name: "Fall Cohort", join_code: "ABC123DE", instructor_id: "i1" };
const STUDENTS = [
  {
    id: 1,
    cohort_id: 5,
    user_id: "u1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    enrolled_at: "2026-01-15T00:00:00Z",
  },
];
const COURSES = [{ id: 8, title: "Quantum Computing Hardware" }];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/cohorts/5"]}>
      <Routes>
        <Route path="/cohorts/:cohortId" element={<CohortDetailPage />} />
        <Route path="/cohorts" element={<div>Cohorts list page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cohortService.getById.mockResolvedValue(COHORT);
  cohortService.listStudents.mockResolvedValue({ students: STUDENTS });
  courseService.list.mockResolvedValue({ courses: COURSES });
});

test("renders the cohort name, join code, and roster", async () => {
  renderPage();

  expect(await screen.findByRole("heading", { name: "Fall Cohort" })).toBeInTheDocument();
  expect(screen.getByText("ABC123DE")).toBeInTheDocument();
  expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  expect(screen.getByText("ada@example.com")).toBeInTheDocument();
});

test("renaming the cohort saves and shows a confirmation", async () => {
  const user = userEvent.setup();
  cohortService.update.mockResolvedValue({ ...COHORT, name: "Renamed Cohort" });
  renderPage();

  await screen.findByRole("heading", { name: "Fall Cohort" });
  const nameInput = screen.getByLabelText("Cohort name");
  await user.clear(nameInput);
  await user.type(nameInput, "Renamed Cohort");
  await user.click(screen.getByRole("button", { name: "Save name" }));

  expect(cohortService.update).toHaveBeenCalledWith("5", { name: "Renamed Cohort" });
  expect(await screen.findByText("Renamed.")).toBeInTheDocument();
});

test("copies the invite link to the clipboard", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  renderPage();

  await screen.findByText("ABC123DE");
  await user.click(screen.getByRole("button", { name: "Copy invite link" }));

  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/join/ABC123DE"));
  expect(await screen.findByRole("button", { name: "Copied!" })).toBeInTheDocument();
});

test("regenerating the join code replaces the displayed code", async () => {
  const user = userEvent.setup();
  cohortService.regenerateJoinCode.mockResolvedValue({ ...COHORT, join_code: "NEW98765" });
  renderPage();

  await screen.findByText("ABC123DE");
  await user.click(screen.getByRole("button", { name: "Regenerate" }));

  expect(cohortService.regenerateJoinCode).toHaveBeenCalledWith("5");
  expect(await screen.findByText("NEW98765")).toBeInTheDocument();
});

test("bulk-enrolling by email shows per-row results and refreshes the roster", async () => {
  const user = userEvent.setup();
  cohortService.bulkEnrollStudents.mockResolvedValue([
    { email: "a@example.com", status: "enrolled" },
    { email: "b@example.com", status: "failed", reason: "No account found for this email." },
  ]);
  renderPage();

  await screen.findByText("ABC123DE");
  await user.type(screen.getByLabelText("Or add students by email"), "a@example.com,b@example.com");
  await user.click(screen.getByRole("button", { name: "Add students" }));

  expect(cohortService.bulkEnrollStudents).toHaveBeenCalledWith("5", [
    "a@example.com",
    "b@example.com",
  ]);
  expect(await screen.findByText(/a@example.com.*Added/)).toBeInTheDocument();
  expect(screen.getByText(/b@example.com.*No account found/)).toBeInTheDocument();
});

test("removing a student drops them from the roster, with no confirmation dialog", async () => {
  const user = userEvent.setup();
  cohortService.removeStudent.mockResolvedValue({ id: 1, status: "removed" });
  renderPage();

  await screen.findByText("Ada Lovelace");
  await user.click(screen.getByRole("button", { name: "Remove" }));

  expect(cohortService.removeStudent).toHaveBeenCalledWith("5", "u1");
  await screen.findByText("No students enrolled yet.");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("viewing a student's progress fetches it for the selected course", async () => {
  const user = userEvent.setup();
  progressService.listForUser.mockResolvedValue({
    progress: [{ course_id: 8, xp: 120, current_streak: 4, completed_at: null }],
  });
  renderPage();

  await screen.findByText("Ada Lovelace");
  await user.click(screen.getByRole("button", { name: "View progress" }));
  await user.selectOptions(screen.getByLabelText("Course"), "8");

  expect(progressService.listForUser).toHaveBeenCalledWith({ userId: "u1", courseId: "8" });
  expect(await screen.findByText(/120 XP/)).toBeInTheDocument();
  expect(screen.getByText(/4-day streak/)).toBeInTheDocument();
});

test("a student with no progress in the selected course shows a plain message, not an error", async () => {
  const user = userEvent.setup();
  progressService.listForUser.mockResolvedValue({ progress: [] });
  renderPage();

  await screen.findByText("Ada Lovelace");
  await user.click(screen.getByRole("button", { name: "View progress" }));
  await user.selectOptions(screen.getByLabelText("Course"), "8");

  expect(await screen.findByText("No progress recorded for this course.")).toBeInTheDocument();
});

test("deleting the cohort requires confirmation, then navigates back to the cohort list", async () => {
  const user = userEvent.setup();
  cohortService.remove.mockResolvedValue(undefined);
  renderPage();

  await screen.findByRole("heading", { name: "Fall Cohort" });
  await user.click(screen.getByRole("button", { name: "Delete cohort" }));

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("permanently removed");

  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  expect(cohortService.remove).toHaveBeenCalledWith("5");
  expect(await screen.findByText("Cohorts list page")).toBeInTheDocument();
});

test("a failed delete keeps the caller on the page and shows an error", async () => {
  const user = userEvent.setup();
  cohortService.remove.mockRejectedValue({
    response: { data: { error: { code: "FORBIDDEN", message: "You do not own this cohort." } } },
  });
  renderPage();

  await screen.findByRole("heading", { name: "Fall Cohort" });
  await user.click(screen.getByRole("button", { name: "Delete cohort" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("You do not own this cohort.");
  expect(screen.queryByText("Cohorts list page")).not.toBeInTheDocument();
});
