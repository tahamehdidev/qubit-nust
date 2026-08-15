import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { chapterService } from "../services/chapter.service.js";
import { lessonService } from "../services/lesson.service.js";
import { ContentChapterDetailPage } from "./ContentChapterDetailPage.jsx";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../services/course.service.js", () => ({
  courseService: { getById: vi.fn() },
}));
vi.mock("../services/chapter.service.js", () => ({
  chapterService: { update: vi.fn(), remove: vi.fn() },
}));
vi.mock("../services/lesson.service.js", () => ({
  lessonService: { listForChapter: vi.fn(), create: vi.fn(), reorder: vi.fn() },
}));

const COURSE = {
  id: 5,
  title: "Quantum Algorithms",
  created_by_id: "i1",
  chapters: [{ id: 10, course_id: 5, title: "Gates and Circuits", order_index: 1 }],
};
const LESSONS = [
  { id: 100, chapter_id: 10, title: "Intro to Gates", order_index: 1 },
  { id: 101, chapter_id: 10, title: "Two-Qubit Gates", order_index: 2 },
];

function renderPage(initialState = { courseId: 5, courseTitle: "Quantum Algorithms" }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/admin/content/chapters/10", state: initialState }]}>
      <Routes>
        <Route path="/admin/content/chapters/:chapterId" element={<ContentChapterDetailPage />} />
        <Route path="/admin/content" element={<div>Courses list page</div>} />
        <Route path="/admin/content/courses/:courseId" element={<div>Course detail page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  courseService.getById.mockResolvedValue(COURSE);
  lessonService.listForChapter.mockResolvedValue({ lessons: LESSONS });
});

test("redirects to the course list when no courseId was passed via router state", async () => {
  // Explicitly null, not omitted -- renderPage's default parameter only kicks in for
  // `undefined`, so calling it with no argument would silently re-run the happy path instead.
  renderPage(null);
  expect(await screen.findByText("Courses list page")).toBeInTheDocument();
  expect(courseService.getById).not.toHaveBeenCalled();
});

test("renders the chapter title, breadcrumb, and lesson list", async () => {
  renderPage();

  expect(await screen.findByRole("heading", { name: "Gates and Circuits" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Quantum Algorithms/ })).toHaveAttribute(
    "href",
    "/admin/content/courses/5"
  );
  expect(screen.getByText("Intro to Gates")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Intro to Gates/ })).toHaveAttribute(
    "href",
    "/admin/content/lessons/100"
  );
});

test("a non-owner instructor sees a read-only note and no write affordances", async () => {
  useAuth.mockReturnValue({ user: { id: "i2", role: "instructor" } });
  renderPage();

  expect(await screen.findByText(/read-only for you here/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Delete chapter" })).not.toBeInTheDocument();
});

test("saving a rename calls update and shows a confirmation", async () => {
  const user = userEvent.setup();
  chapterService.update.mockResolvedValue({ id: 10, course_id: 5, title: "Renamed", order_index: 1 });
  renderPage();

  const titleInput = await screen.findByLabelText("Title");
  await user.clear(titleInput);
  await user.type(titleInput, "Renamed");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(chapterService.update).toHaveBeenCalledWith("10", { title: "Renamed" });
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
});

test("adding a lesson appends it to the list", async () => {
  const user = userEvent.setup();
  lessonService.create.mockResolvedValue({ id: 102, chapter_id: 10, title: "New Lesson", order_index: 3 });
  renderPage();

  await screen.findByText("Intro to Gates");
  await user.type(screen.getByLabelText("New lesson title"), "New Lesson");
  await user.click(screen.getByRole("button", { name: "Add lesson" }));

  expect(lessonService.create).toHaveBeenCalledWith("10", { title: "New Lesson" });
  expect(await screen.findByText("New Lesson")).toBeInTheDocument();
});

test("reordering a lesson calls lessonService.reorder with the full ordered id list", async () => {
  const user = userEvent.setup();
  lessonService.reorder.mockResolvedValue(undefined);
  renderPage();

  await screen.findByText("Intro to Gates");
  await user.click(screen.getByRole("button", { name: "Move Intro to Gates down" }));

  expect(lessonService.reorder).toHaveBeenCalledWith("10", [101, 100]);
});

test("a failed reorder shows an error banner", async () => {
  const user = userEvent.setup();
  lessonService.reorder.mockRejectedValue({
    response: { data: { error: { code: "REORDER_SET_MISMATCH", message: "Reorder failed." } } },
  });
  renderPage();

  await screen.findByText("Intro to Gates");
  await user.click(screen.getByRole("button", { name: "Move Intro to Gates down" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Reorder failed.");
});

test("deleting the chapter probes for cascade counts, then deletes and navigates to the course page", async () => {
  const user = userEvent.setup();
  chapterService.remove.mockRejectedValueOnce({
    response: {
      data: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Deleting this chapter will also delete 3 lesson(s) and 9 screen(s). Pass ?confirm=true to proceed.",
        },
      },
    },
  });
  renderPage();

  await screen.findByRole("heading", { name: "Gates and Circuits" });
  await user.click(screen.getByRole("button", { name: "Delete chapter" }));

  expect(chapterService.remove).toHaveBeenNthCalledWith(1, "10");

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("also delete 3 lesson(s)");

  chapterService.remove.mockResolvedValueOnce(undefined);
  await user.type(within(dialog).getByRole("textbox"), "Gates and Circuits");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  expect(chapterService.remove).toHaveBeenNthCalledWith(2, "10", { confirm: true });
  expect(await screen.findByText("Course detail page")).toBeInTheDocument();
});
