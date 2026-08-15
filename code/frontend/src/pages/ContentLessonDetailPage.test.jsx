import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { lessonService } from "../services/lesson.service.js";
import { screenService } from "../services/screen.service.js";
import { practiceSetService } from "../services/practiceSet.service.js";
import { ContentLessonDetailPage } from "./ContentLessonDetailPage.jsx";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../services/course.service.js", () => ({
  courseService: { getById: vi.fn() },
}));
vi.mock("../services/lesson.service.js", () => ({
  lessonService: { getById: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));
vi.mock("../services/screen.service.js", () => ({
  screenService: { listForLesson: vi.fn(), reorder: vi.fn() },
}));
vi.mock("../services/practiceSet.service.js", () => ({
  practiceSetService: { listForLesson: vi.fn(), create: vi.fn() },
}));

const COURSE = {
  id: 5,
  title: "Quantum Algorithms",
  created_by_id: "i1",
  chapters: [{ id: 10, course_id: 5, title: "Gates and Circuits", order_index: 1 }],
};
const LESSON = {
  id: 100,
  chapter_id: 10,
  title: "Intro to Gates",
  order_index: 1,
  course_id: 5,
  next_lesson_id: null,
};
const SCREENS = [
  { id: 1000, lesson_id: 100, type: "explanation", content: { text: "Hello world" }, order_index: 1, questions: [] },
  {
    id: 1001,
    lesson_id: 100,
    type: "simulation",
    content: { widgetType: "bloch_sphere", params: { mode: "free_placement" } },
    order_index: 2,
    questions: [],
  },
];

const PRACTICE_SETS = [{ id: 500, lesson_id: 100, title: "Warm-up Set" }];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/content/lessons/100"]}>
      <Routes>
        <Route path="/admin/content/lessons/:lessonId" element={<ContentLessonDetailPage />} />
        <Route path="/admin/content/chapters/:chapterId" element={<div>Chapter detail page</div>} />
        <Route
          path="/admin/content/lessons/:lessonId/screens/:screenId"
          element={<div>Screen editor page</div>}
        />
        <Route
          path="/admin/content/practice-sets/:practiceSetId"
          element={<div>Practice set detail page</div>}
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  lessonService.getById.mockResolvedValue(LESSON);
  courseService.getById.mockResolvedValue(COURSE);
  screenService.listForLesson.mockResolvedValue({ screens: SCREENS });
  practiceSetService.listForLesson.mockResolvedValue({ practiceSets: PRACTICE_SETS });
});

test("renders the lesson title, breadcrumb, and screen list", async () => {
  renderPage();

  expect(await screen.findByRole("heading", { name: "Intro to Gates" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Gates and Circuits/ })).toHaveAttribute(
    "href",
    "/admin/content/chapters/10"
  );
  expect(screen.getByText("Hello world")).toBeInTheDocument();
  expect(screen.getByText(/Simulation — Bloch sphere/)).toBeInTheDocument();
});

test("a non-owner instructor sees a read-only note and no write affordances", async () => {
  useAuth.mockReturnValue({ user: { id: "i2", role: "instructor" } });
  renderPage();

  expect(await screen.findByText(/read-only for you here/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Delete lesson" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Add screen/ })).not.toBeInTheDocument();
});

test("saving a rename calls update and shows a confirmation", async () => {
  const user = userEvent.setup();
  lessonService.update.mockResolvedValue({ ...LESSON, title: "Renamed" });
  renderPage();

  const titleInput = await screen.findByLabelText("Title");
  await user.clear(titleInput);
  await user.type(titleInput, "Renamed");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(lessonService.update).toHaveBeenCalledWith("100", { title: "Renamed" });
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
});

test("the add-screen link points at the new-screen route", async () => {
  renderPage();
  const link = await screen.findByRole("link", { name: /Add screen/ });
  expect(link).toHaveAttribute("href", "/admin/content/lessons/100/screens/new");
});

test("clicking a screen navigates to its editor route", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByText("Hello world"));
  expect(await screen.findByText("Screen editor page")).toBeInTheDocument();
});

test("reordering screens calls screenService.reorder with the full ordered id list", async () => {
  const user = userEvent.setup();
  screenService.reorder.mockResolvedValue(undefined);
  renderPage();

  await screen.findByText("Hello world");
  await user.click(screen.getByRole("button", { name: "Move Hello world down" }));

  expect(screenService.reorder).toHaveBeenCalledWith("100", [1001, 1000]);
});

test("a failed reorder shows an error banner", async () => {
  const user = userEvent.setup();
  screenService.reorder.mockRejectedValue({
    response: { data: { error: { code: "REORDER_SET_MISMATCH", message: "Reorder failed." } } },
  });
  renderPage();

  await screen.findByText("Hello world");
  await user.click(screen.getByRole("button", { name: "Move Hello world down" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Reorder failed.");
});

test("renders the practice-set list, each linking to its own detail page", async () => {
  renderPage();

  const link = await screen.findByRole("link", { name: "Warm-up Set" });
  expect(link).toHaveAttribute("href", "/admin/content/practice-sets/500");
});

test("clicking a practice set navigates to its detail page", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByRole("link", { name: "Warm-up Set" }));

  expect(await screen.findByText("Practice set detail page")).toBeInTheDocument();
});

test("adding a practice set appends it to the list", async () => {
  const user = userEvent.setup();
  practiceSetService.create.mockResolvedValue({ id: 501, lesson_id: 100, title: "New Set" });
  renderPage();

  await screen.findByRole("link", { name: "Warm-up Set" });
  await user.type(screen.getByLabelText("New practice set title"), "New Set");
  await user.click(screen.getByRole("button", { name: "Add practice set" }));

  expect(practiceSetService.create).toHaveBeenCalledWith("100", { title: "New Set" });
  expect(await screen.findByRole("link", { name: "New Set" })).toBeInTheDocument();
});

test("a non-owner instructor sees no add-practice-set form", async () => {
  useAuth.mockReturnValue({ user: { id: "i2", role: "instructor" } });
  renderPage();

  await screen.findByRole("link", { name: "Warm-up Set" });
  expect(screen.queryByLabelText("New practice set title")).not.toBeInTheDocument();
});

test("deleting the lesson probes for cascade counts, then deletes and navigates to the chapter page", async () => {
  const user = userEvent.setup();
  lessonService.remove.mockRejectedValueOnce({
    response: {
      data: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Deleting this lesson will also delete 2 screen(s). Pass ?confirm=true to proceed.",
        },
      },
    },
  });
  renderPage();

  await screen.findByRole("heading", { name: "Intro to Gates" });
  await user.click(screen.getByRole("button", { name: "Delete lesson" }));

  expect(lessonService.remove).toHaveBeenNthCalledWith(1, "100");

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("also delete 2 screen(s)");

  lessonService.remove.mockResolvedValueOnce(undefined);
  await user.type(within(dialog).getByRole("textbox"), "Intro to Gates");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  expect(lessonService.remove).toHaveBeenNthCalledWith(2, "100", { confirm: true });
  expect(await screen.findByText("Chapter detail page")).toBeInTheDocument();
});
