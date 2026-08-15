import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { lessonService } from "../services/lesson.service.js";
import { screenService } from "../services/screen.service.js";
import { questionService } from "../services/question.service.js";
import { ContentScreenEditorPage } from "./ContentScreenEditorPage.jsx";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../services/course.service.js", () => ({
  courseService: { getById: vi.fn() },
}));
vi.mock("../services/lesson.service.js", () => ({
  lessonService: { getById: vi.fn() },
}));
vi.mock("../services/screen.service.js", () => ({
  screenService: {
    listForLesson: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    attachQuestion: vi.fn(),
    detachQuestion: vi.fn(),
  },
}));
vi.mock("../services/question.service.js", () => ({
  questionService: { list: vi.fn() },
}));

const COURSE = { id: 5, title: "Quantum Algorithms", created_by_id: "i1", chapters: [] };
const LESSON = { id: 100, chapter_id: 10, title: "Intro to Gates", order_index: 1, course_id: 5 };
const EXPLANATION_SCREEN = {
  id: 1000,
  lesson_id: 100,
  type: "explanation",
  content: { text: "Existing text" },
  order_index: 1,
  questions: [],
};

function renderPage(screenId) {
  return render(
    <MemoryRouter initialEntries={[`/admin/content/lessons/100/screens/${screenId}`]}>
      <Routes>
        <Route
          path="/admin/content/lessons/:lessonId/screens/:screenId"
          element={<ContentScreenEditorPage />}
        />
        <Route path="/admin/content/lessons/:lessonId" element={<div>Lesson detail page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  lessonService.getById.mockResolvedValue(LESSON);
  courseService.getById.mockResolvedValue(COURSE);
  screenService.listForLesson.mockResolvedValue({ screens: [EXPLANATION_SCREEN] });
});

test("create mode renders an empty explanation form by default", async () => {
  renderPage("new");

  expect(await screen.findByRole("heading", { name: "Add screen" })).toBeInTheDocument();
  expect(screen.getByLabelText("Text")).toHaveValue("");
  expect(screen.queryByRole("button", { name: "Delete screen" })).not.toBeInTheDocument();
});

test("submitting a new screen calls create and navigates back to the lesson", async () => {
  const user = userEvent.setup();
  screenService.create.mockResolvedValue({ id: 2000 });
  renderPage("new");

  await user.type(await screen.findByLabelText("Text"), "New explanation text");
  await user.click(screen.getByRole("button", { name: "Create screen" }));

  expect(screenService.create).toHaveBeenCalledWith("100", {
    type: "explanation",
    content: { text: "New explanation text" },
  });
  expect(await screen.findByText("Lesson detail page")).toBeInTheDocument();
});

test("edit mode pre-fills the existing screen's type and content", async () => {
  renderPage("1000");

  expect(await screen.findByRole("heading", { name: "Edit screen" })).toBeInTheDocument();
  expect(screen.getByLabelText("Text")).toHaveValue("Existing text");
});

test("saving an edit calls update and shows a confirmation", async () => {
  const user = userEvent.setup();
  screenService.update.mockResolvedValue({ ...EXPLANATION_SCREEN, content: { text: "Updated" } });
  renderPage("1000");

  const textarea = await screen.findByLabelText("Text");
  await user.clear(textarea);
  await user.type(textarea, "Updated");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(screenService.update).toHaveBeenCalledWith("1000", {
    type: "explanation",
    content: { text: "Updated" },
  });
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
});

test("switching screen type resets the content to that type's default", async () => {
  const user = userEvent.setup();
  renderPage("1000");

  await screen.findByLabelText("Text");
  await user.selectOptions(screen.getByLabelText("Screen type"), "simulation");

  expect(screen.queryByLabelText("Text")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Widget type")).toBeInTheDocument();
});

test("submitting a simulation screen with client-side-invalid params shows an error and does not submit", async () => {
  const user = userEvent.setup();
  renderPage("new");

  await user.selectOptions(await screen.findByLabelText("Screen type"), "simulation");
  await user.selectOptions(screen.getByLabelText("Widget type"), "amplitude_bar_chart");
  await user.click(screen.getByRole("button", { name: "Create screen" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Add at least one basis state.");
  expect(screenService.create).not.toHaveBeenCalled();
});

test("a question screen in create mode shows a save-first note, not the picker", async () => {
  const user = userEvent.setup();
  renderPage("new");

  await user.selectOptions(await screen.findByLabelText("Screen type"), "question");

  expect(screen.getByText(/Save this screen first/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Attach a question" })).not.toBeInTheDocument();
});

test("attaching a question in edit mode calls screenService.attachQuestion and shows the attached prompt", async () => {
  const user = userEvent.setup();
  const questionScreen = { ...EXPLANATION_SCREEN, id: 1001, type: "question", content: {}, questions: [] };
  screenService.listForLesson.mockResolvedValue({ screens: [questionScreen] });
  questionService.list.mockResolvedValue({
    questions: [{ id: 7, prompt: "What is 2+2?", type: "mcq" }],
    pagination: { page: 1, limit: 10, total: 1 },
  });
  screenService.attachQuestion.mockResolvedValue(undefined);
  renderPage("1001");

  await user.click(await screen.findByRole("button", { name: "Attach a question" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(await within(dialog).findByRole("button", { name: "Use this question" }));

  expect(screenService.attachQuestion).toHaveBeenCalledWith("1001", 7);
  // The modal's <dialog> stays in the DOM (just closed) rather than unmounting, so its own copy
  // of the prompt text is still present -- assert via the attached-question actions instead of
  // re-querying the (now ambiguous) prompt text.
  expect(await screen.findByRole("button", { name: "Detach" })).toBeInTheDocument();
});

test("a non-owner instructor sees a read-only note and no form", async () => {
  useAuth.mockReturnValue({ user: { id: "i2", role: "instructor" } });
  renderPage("1000");

  expect(await screen.findByText(/read-only for you here/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Text")).not.toBeInTheDocument();
});

test("an unknown screenId shows an error state", async () => {
  renderPage("9999");
  expect(await screen.findByRole("alert")).toHaveTextContent("Screen not found.");
});

test("deleting the screen opens a confirm modal, then removes it and navigates back", async () => {
  const user = userEvent.setup();
  screenService.remove.mockResolvedValue(undefined);
  renderPage("1000");

  await user.click(await screen.findByRole("button", { name: "Delete screen" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  expect(screenService.remove).toHaveBeenCalledWith("1000");
  expect(await screen.findByText("Lesson detail page")).toBeInTheDocument();
});
