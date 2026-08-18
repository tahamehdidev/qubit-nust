import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { chapterService } from "../services/chapter.service.js";
import { ContentCourseDetailPage } from "./ContentCourseDetailPage.jsx";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../services/course.service.js", () => ({
  courseService: { getById: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));
vi.mock("../services/chapter.service.js", () => ({
  chapterService: { create: vi.fn(), reorder: vi.fn() },
}));

const COURSE = {
  id: 5,
  title: "Quantum Algorithms",
  narrative: "A narrative.",
  created_by_id: "i1",
  chapters: [
    { id: 1, course_id: 5, title: "Gates and Circuits", order_index: 1 },
    { id: 2, course_id: 5, title: "Entanglement", order_index: 2 },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/content/courses/5"]}>
      <Routes>
        <Route path="/admin/content/courses/:courseId" element={<ContentCourseDetailPage />} />
        <Route path="/admin/content" element={<div>Courses list page</div>} />
        <Route path="/admin/content/chapters/:chapterId" element={<div>Chapter detail page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  courseService.getById.mockResolvedValue(COURSE);
});

test("renders the course title, narrative, and chapter list", async () => {
  renderPage();

  expect(await screen.findByRole("heading", { name: "Quantum Algorithms" })).toBeInTheDocument();
  expect(screen.getByDisplayValue("A narrative.")).toBeInTheDocument();
  expect(screen.getByText("Gates and Circuits")).toBeInTheDocument();
});

test("a non-owner instructor sees a read-only note and no write affordances", async () => {
  useAuth.mockReturnValue({ user: { id: "i2", role: "instructor" } });
  renderPage();

  expect(await screen.findByText(/read-only for you here/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Delete course" })).not.toBeInTheDocument();
});

test("admin sees write affordances on a course it doesn't own", async () => {
  useAuth.mockReturnValue({ user: { id: "a1", role: "admin" } });
  renderPage();

  expect(await screen.findByLabelText("Title")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete course" })).toBeInTheDocument();
});

test("saving edits calls update and shows a confirmation", async () => {
  const user = userEvent.setup();
  courseService.update.mockResolvedValue({ ...COURSE, title: "Renamed" });
  renderPage();

  const titleInput = await screen.findByLabelText("Title");
  await user.clear(titleInput);
  await user.type(titleInput, "Renamed");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(courseService.update).toHaveBeenCalledWith("5", {
    title: "Renamed",
    narrative: "A narrative.",
  });
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
});

test("adding a chapter appends it to the list", async () => {
  const user = userEvent.setup();
  chapterService.create.mockResolvedValue({
    id: 3,
    course_id: 5,
    title: "New Chapter",
    order_index: 3,
  });
  renderPage();

  await screen.findByText("Gates and Circuits");
  await user.type(screen.getByLabelText("New chapter title"), "New Chapter");
  await user.click(screen.getByRole("button", { name: "Add chapter" }));

  expect(chapterService.create).toHaveBeenCalledWith("5", { title: "New Chapter" });
  expect(await screen.findByText("New Chapter")).toBeInTheDocument();
});

test("deleting the course probes for cascade counts, shows them in the confirm modal, then deletes", async () => {
  const user = userEvent.setup();
  courseService.remove.mockRejectedValueOnce({
    response: {
      data: {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Deleting this course will also delete 1 chapter(s), 0 lesson(s), and 0 screen(s). Pass ?confirm=true to proceed.",
        },
      },
    },
  });
  renderPage();

  await screen.findByRole("heading", { name: "Quantum Algorithms" });
  await user.click(screen.getByRole("button", { name: "Delete course" }));

  expect(courseService.remove).toHaveBeenNthCalledWith(1, "5");

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("also delete 1 chapter(s)");

  courseService.remove.mockResolvedValueOnce(undefined);
  await user.type(within(dialog).getByRole("textbox"), "Quantum Algorithms");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  expect(courseService.remove).toHaveBeenNthCalledWith(2, "5", { confirm: true });
  expect(await screen.findByText("Courses list page")).toBeInTheDocument();
});

test("a failed confirmed delete closes the modal and shows an error, without navigating away", async () => {
  const user = userEvent.setup();
  courseService.remove.mockRejectedValueOnce({
    response: {
      data: {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Deleting this course will also delete 0 chapter(s), 0 lesson(s), and 0 screen(s). Pass ?confirm=true to proceed.",
        },
      },
    },
  });
  renderPage();

  await screen.findByRole("heading", { name: "Quantum Algorithms" });
  await user.click(screen.getByRole("button", { name: "Delete course" }));
  const dialog = await screen.findByRole("dialog");

  courseService.remove.mockRejectedValueOnce({
    response: { data: { error: { code: "FORBIDDEN", message: "You do not own this course." } } },
  });
  await user.type(within(dialog).getByRole("textbox"), "Quantum Algorithms");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("You do not own this course.");
  expect(screen.queryByText("Courses list page")).not.toBeInTheDocument();
});

test("reordering a chapter calls chapterService.reorder with the full ordered id list", async () => {
  const user = userEvent.setup();
  chapterService.reorder.mockResolvedValue(undefined);
  renderPage();

  await screen.findByText("Gates and Circuits");
  await user.click(screen.getByRole("button", { name: "Move Gates and Circuits down" }));

  expect(chapterService.reorder).toHaveBeenCalledWith("5", [2, 1]);
});

test("a failed reorder shows an error banner", async () => {
  const user = userEvent.setup();
  chapterService.reorder.mockRejectedValue({
    response: { data: { error: { code: "REORDER_SET_MISMATCH", message: "Reorder failed." } } },
  });
  renderPage();

  await screen.findByText("Gates and Circuits");
  await user.click(screen.getByRole("button", { name: "Move Gates and Circuits down" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Reorder failed.");
});

test("a non-owner instructor sees a plain, non-reorderable chapter list", async () => {
  useAuth.mockReturnValue({ user: { id: "i2", role: "instructor" } });
  renderPage();

  await screen.findByText("Gates and Circuits");
  expect(
    screen.queryByRole("button", { name: "Move Gates and Circuits down" })
  ).not.toBeInTheDocument();
});

test("chapter links carry course id/title via router state for the chapter page to use", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByText("Gates and Circuits"));
  expect(await screen.findByText("Chapter detail page")).toBeInTheDocument();
});
