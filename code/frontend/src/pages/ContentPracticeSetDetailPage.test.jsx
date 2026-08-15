import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { lessonService } from "../services/lesson.service.js";
import { practiceSetService } from "../services/practiceSet.service.js";
import { questionService } from "../services/question.service.js";
import { ContentPracticeSetDetailPage } from "./ContentPracticeSetDetailPage.jsx";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../services/course.service.js", () => ({
  courseService: { getById: vi.fn() },
}));
vi.mock("../services/lesson.service.js", () => ({
  lessonService: { getById: vi.fn() },
}));
vi.mock("../services/practiceSet.service.js", () => ({
  practiceSetService: {
    getById: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    attachQuestion: vi.fn(),
    detachQuestion: vi.fn(),
    reorderQuestions: vi.fn(),
  },
}));
vi.mock("../services/question.service.js", () => ({
  questionService: { list: vi.fn() },
}));

const COURSE = { id: 5, title: "Quantum Algorithms", created_by_id: "i1", chapters: [] };
const LESSON = { id: 100, chapter_id: 10, title: "Intro to Gates", order_index: 1, course_id: 5 };
const QUESTION_A = { id: 1, prompt: "What is 2+2?", type: "mcq" };
const QUESTION_B = { id: 2, prompt: "Order these", type: "drag_drop" };
const PRACTICE_SET = { id: 500, lesson_id: 100, title: "Warm-up Set", questions: [QUESTION_A, QUESTION_B] };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/content/practice-sets/500"]}>
      <Routes>
        <Route
          path="/admin/content/practice-sets/:practiceSetId"
          element={<ContentPracticeSetDetailPage />}
        />
        <Route path="/admin/content/lessons/:lessonId" element={<div>Lesson detail page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  practiceSetService.getById.mockResolvedValue(PRACTICE_SET);
  lessonService.getById.mockResolvedValue(LESSON);
  courseService.getById.mockResolvedValue(COURSE);
  questionService.list.mockResolvedValue({
    questions: [{ id: 3, prompt: "A new question", type: "numeric" }],
    pagination: { page: 1, limit: 10, total: 1 },
  });
});

test("renders the title, breadcrumb, and question list", async () => {
  renderPage();

  expect(await screen.findByRole("heading", { name: "Warm-up Set" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Intro to Gates/ })).toHaveAttribute(
    "href",
    "/admin/content/lessons/100"
  );
  expect(screen.getByText("What is 2+2?")).toBeInTheDocument();
  expect(screen.getByText("Order these")).toBeInTheDocument();
});

test("a non-owner instructor sees a read-only note and no write affordances", async () => {
  useAuth.mockReturnValue({ user: { id: "i2", role: "instructor" } });
  renderPage();

  expect(await screen.findByText(/read-only for you here/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Detach" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Attach a question" })).not.toBeInTheDocument();
});

test("saving a rename calls update and shows a confirmation", async () => {
  const user = userEvent.setup();
  practiceSetService.update.mockResolvedValue({ ...PRACTICE_SET, title: "Renamed" });
  renderPage();

  const titleInput = await screen.findByLabelText("Title");
  await user.clear(titleInput);
  await user.type(titleInput, "Renamed");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(practiceSetService.update).toHaveBeenCalledWith("500", { title: "Renamed" });
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
});

test("reordering questions calls reorderQuestions with the full ordered id list", async () => {
  const user = userEvent.setup();
  practiceSetService.reorderQuestions.mockResolvedValue(undefined);
  renderPage();

  await screen.findByText("What is 2+2?");
  await user.click(screen.getByRole("button", { name: "Move What is 2+2? down" }));

  expect(practiceSetService.reorderQuestions).toHaveBeenCalledWith("500", [2, 1]);
});

test("a failed reorder shows an error banner", async () => {
  const user = userEvent.setup();
  practiceSetService.reorderQuestions.mockRejectedValue({
    response: { data: { error: { code: "REORDER_SET_MISMATCH", message: "Reorder failed." } } },
  });
  renderPage();

  await screen.findByText("What is 2+2?");
  await user.click(screen.getByRole("button", { name: "Move What is 2+2? down" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Reorder failed.");
});

test("detaching a question calls detachQuestion with no confirmation and removes it from the list", async () => {
  const user = userEvent.setup();
  practiceSetService.detachQuestion.mockResolvedValue(undefined);
  renderPage();

  await screen.findByText("What is 2+2?");
  const row = screen.getByText("What is 2+2?").closest(".content-practice-set-detail__question-row");
  await user.click(within(row).getByRole("button", { name: "Detach" }));

  expect(practiceSetService.detachQuestion).toHaveBeenCalledWith("500", 1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(await screen.findByText("Order these")).toBeInTheDocument();
  expect(screen.queryByText("What is 2+2?")).not.toBeInTheDocument();
});

test("attaching a question from the picker calls attachQuestion and adds it to the list", async () => {
  const user = userEvent.setup();
  practiceSetService.attachQuestion.mockResolvedValue(undefined);
  renderPage();

  await user.click(await screen.findByRole("button", { name: "Attach a question" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(await within(dialog).findByRole("button", { name: "Use this question" }));

  expect(practiceSetService.attachQuestion).toHaveBeenCalledWith("500", 3);
  // The modal's <dialog> stays in the DOM (just closed) rather than unmounting, so its own copy
  // of the prompt text is still present -- assert via the question row it landed in instead of
  // the (now ambiguous) prompt text alone.
  const matches = await screen.findAllByText("A new question");
  expect(
    matches.some((el) => el.closest(".content-practice-set-detail__question-row"))
  ).toBe(true);
});

test("deleting the practice set uses a plain confirm modal (no typed name), then navigates back", async () => {
  const user = userEvent.setup();
  practiceSetService.remove.mockResolvedValue(undefined);
  renderPage();

  await user.click(await screen.findByRole("button", { name: "Delete practice set" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  expect(practiceSetService.remove).toHaveBeenCalledWith("500");
  expect(await screen.findByText("Lesson detail page")).toBeInTheDocument();
});

test("an unknown practice set shows an error state", async () => {
  practiceSetService.getById.mockRejectedValue({
    response: { data: { error: { code: "NOT_FOUND", message: "Practice set not found." } } },
  });
  renderPage();

  expect(await screen.findByRole("alert")).toHaveTextContent("Practice set not found.");
});
