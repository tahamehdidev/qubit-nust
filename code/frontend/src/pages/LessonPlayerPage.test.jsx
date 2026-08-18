import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { lessonService } from "../services/lesson.service.js";
import { screenService } from "../services/screen.service.js";
import { practiceSetService } from "../services/practiceSet.service.js";
import { attemptService } from "../services/attempt.service.js";
import { courseService } from "../services/course.service.js";
import { LessonPlayerPage, renderWithKetNotation } from "./LessonPlayerPage.jsx";

vi.mock("../services/lesson.service.js", () => ({
  lessonService: { getById: vi.fn(), listForChapter: vi.fn() },
}));
vi.mock("../services/screen.service.js", () => ({
  screenService: { listForLesson: vi.fn() },
}));
vi.mock("../services/practiceSet.service.js", () => ({
  practiceSetService: { listForLesson: vi.fn() },
}));
vi.mock("../services/attempt.service.js", () => ({
  attemptService: { submit: vi.fn() },
}));
vi.mock("../services/course.service.js", () => ({
  courseService: { getById: vi.fn() },
}));

const LESSON = {
  id: 7,
  chapter_id: 2,
  course_id: 3,
  title: "Qubits 101",
  order_index: 1,
  next_lesson_id: null,
};

const COURSE = {
  id: 3,
  title: "Quantum Computing Hardware",
  chapters: [
    { id: 1, title: "Introduction", order_index: 1 },
    { id: 2, title: "What a Qubit Is, Physically", order_index: 2 },
    { id: 3, title: "Going Further", order_index: 3 },
  ],
};

const CHAPTER_LESSONS = [
  { id: 7, chapter_id: 2, title: "Qubits 101", order_index: 1 },
  { id: 8, chapter_id: 2, title: "Superposition", order_index: 2 },
];

const MCQ_QUESTION = {
  id: 55,
  type: "mcq",
  prompt: "Which state is |0⟩?",
  content: { options: ["Ground state", "Excited state"] },
};

const SCREENS = [
  {
    id: 900,
    lesson_id: 7,
    type: "explanation",
    content: { text: "A qubit has two states." },
    order_index: 1,
    questions: [],
  },
  {
    id: 901,
    lesson_id: 7,
    type: "question",
    content: {},
    order_index: 2,
    questions: [MCQ_QUESTION],
  },
  {
    id: 902,
    lesson_id: 7,
    type: "explanation",
    content: { text: "That's the basics." },
    order_index: 3,
    questions: [],
  },
];

function renderPlayer(lessonId = "7") {
  return render(
    <MemoryRouter initialEntries={[`/lessons/${lessonId}`]}>
      <Routes>
        <Route path="/lessons/:lessonId" element={<LessonPlayerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  lessonService.getById.mockResolvedValue(LESSON);
  lessonService.listForChapter.mockResolvedValue({ lessons: CHAPTER_LESSONS, pagination: {} });
  screenService.listForLesson.mockResolvedValue({ screens: SCREENS, pagination: {} });
  practiceSetService.listForLesson.mockResolvedValue({ practiceSets: [], pagination: {} });
  courseService.getById.mockResolvedValue(COURSE);
});

test("fetches the lesson and its screens in parallel, then shows the first screen", async () => {
  renderPlayer();

  expect(await screen.findByRole("heading", { name: "Qubits 101" })).toBeInTheDocument();
  expect(lessonService.getById).toHaveBeenCalledWith("7");
  expect(screenService.listForLesson).toHaveBeenCalledWith("7");
  expect(practiceSetService.listForLesson).toHaveBeenCalledWith("7");
  expect(screen.getByText("A qubit has two states.")).toBeInTheDocument();
  expect(screen.getByText("Screen 1 of 3")).toBeInTheDocument();
});

// Dual-agent critique finding (P1): identical bra-ket notation rendered in two different fonts
// depending on which screen type it landed on -- the Bloch sphere's own readout already used
// font-mono, explanation-screen prose didn't.
test("renderWithKetNotation wraps bra-ket runs in font-mono spans, leaving surrounding prose untouched", () => {
  const nodes = renderWithKetNotation("written |0⟩ and |1⟩, superposition |ψ⟩ = a|0⟩ + b|1⟩.");
  const monoTexts = nodes.filter((n) => typeof n !== "string").map((n) => n.props.children);
  const plainTexts = nodes.filter((n) => typeof n === "string");

  expect(monoTexts).toEqual(["|0⟩", "|1⟩", "|ψ⟩", "|0⟩", "|1⟩"]);
  expect(plainTexts.join("")).toBe("written  and , superposition  = a + b.");
  nodes
    .filter((n) => typeof n !== "string")
    .forEach((n) => expect(n.props.className).toBe("font-mono"));
});

test("renderWithKetNotation returns plain text untouched when there's no notation to wrap", () => {
  expect(renderWithKetNotation("No notation here.")).toEqual(["No notation here."]);
});

test("an explanation screen has Next enabled immediately and advances on click", async () => {
  const user = userEvent.setup();
  renderPlayer();
  await screen.findByText("A qubit has two states.");

  const nextButton = screen.getByRole("button", { name: /Next/ });
  expect(nextButton).toBeEnabled();
  await user.click(nextButton);

  expect(screen.getByText("Screen 2 of 3")).toBeInTheDocument();
  expect(screen.getByText("Which state is |0⟩?")).toBeInTheDocument();
});

test("a question screen disables Next until the attempt reaches a terminal state", async () => {
  const user = userEvent.setup();
  attemptService.submit.mockResolvedValue({ isCorrect: true, xpAwarded: true });
  renderPlayer();
  await screen.findByText("A qubit has two states.");
  await user.click(screen.getByRole("button", { name: /Next/ }));

  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

  await user.click(screen.getByLabelText("Ground state"));
  await user.click(screen.getByRole("button", { name: "Submit" }));

  expect(await screen.findByText(/Correct!/)).toBeInTheDocument();
  expect(attemptService.submit).toHaveBeenCalledWith({
    questionId: 55,
    contextType: "screen",
    contextId: 901,
    answer: { selectedOptionIndex: 0 },
  });
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});

test("an incorrect answer does not unlock Next; retrying and getting it correct does", async () => {
  const user = userEvent.setup();
  attemptService.submit.mockResolvedValueOnce({ isCorrect: false, xpAwarded: false });
  renderPlayer();
  await screen.findByText("A qubit has two states.");
  await user.click(screen.getByRole("button", { name: /Next/ }));

  await user.click(screen.getByLabelText("Ground state"));
  await user.click(screen.getByRole("button", { name: "Submit" }));

  expect(await screen.findByText(/Not quite/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

  attemptService.submit.mockResolvedValueOnce({ isCorrect: true, xpAwarded: true });
  await user.click(screen.getByRole("button", { name: "Try Again" }));
  // Elimination-on-retry (Frontend Milestone 6) disables "Ground state" going forward, matching
  // a real learner who's already been told that answer is wrong -- retry picks the other option.
  expect(screen.getByLabelText("Ground state")).toBeDisabled();
  await user.click(screen.getByLabelText("Excited state"));
  await user.click(screen.getByRole("button", { name: "Submit" }));

  expect(await screen.findByText(/Correct!/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});

test("going Back to an already-answered question screen preserves its graded state (no remount)", async () => {
  const user = userEvent.setup();
  attemptService.submit.mockResolvedValue({ isCorrect: true, xpAwarded: true });
  renderPlayer();
  await screen.findByText("A qubit has two states.");
  await user.click(screen.getByRole("button", { name: /Next/ }));
  await user.click(screen.getByLabelText("Ground state"));
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText(/Correct!/);

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("That's the basics.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Back" }));

  expect(screen.getByText(/Correct!/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  expect(attemptService.submit).toHaveBeenCalledTimes(1);
});

test("Finish lesson on the last screen shows the completion state, and Back returns to the last screen", async () => {
  const user = userEvent.setup();
  attemptService.submit.mockResolvedValue({ isCorrect: true, xpAwarded: true });
  renderPlayer();
  await screen.findByText("A qubit has two states.");
  await user.click(screen.getByRole("button", { name: /Next/ }));
  await user.click(screen.getByLabelText("Ground state"));
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText(/Correct!/);
  await user.click(screen.getByRole("button", { name: "Next" }));

  await user.click(screen.getByRole("button", { name: "Finish lesson" }));

  expect(screen.getByText("Lesson complete!")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Practice this lesson" })).not.toBeInTheDocument();
  // Nav-flow audit: finishing a lesson with no practice set and no next lesson previously had
  // zero forward navigation at all -- "Back to course" is now always present.
  expect(screen.getByRole("link", { name: "Back to course" })).toHaveAttribute(
    "href",
    "/courses/3"
  );
  expect(screen.queryByRole("link", { name: "Next lesson" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText("That's the basics.")).toBeInTheDocument();

  // Regression test: leaving and returning from "Lesson complete!" must not remount the real
  // screens -- it previously did, resetting every visited question's graded state.
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText(/Correct!/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  expect(attemptService.submit).toHaveBeenCalledTimes(1);
});

test("a lesson with a practice set shows a 'Practice this lesson' link once complete", async () => {
  const user = userEvent.setup();
  attemptService.submit.mockResolvedValue({ isCorrect: true, xpAwarded: true });
  practiceSetService.listForLesson.mockResolvedValue({
    practiceSets: [{ id: 300, lesson_id: 7, title: "Practice: Qubits 101" }],
    pagination: {},
  });
  renderPlayer();
  await screen.findByText("A qubit has two states.");
  await user.click(screen.getByRole("button", { name: /Next/ }));
  await user.click(screen.getByLabelText("Ground state"));
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText(/Correct!/);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Finish lesson" }));

  expect(screen.getByRole("link", { name: "Practice this lesson" })).toHaveAttribute(
    "href",
    "/practice-sets/300"
  );
  expect(screen.getByRole("link", { name: "Back to course" })).toHaveAttribute(
    "href",
    "/courses/3"
  );
});

test("a nonexistent lesson shows a 'not found' message with a real link back, no retry button", async () => {
  lessonService.getById.mockRejectedValue({
    response: { data: { error: { code: "NOT_FOUND", message: "Lesson not found." } } },
  });
  renderPlayer("999999");

  expect(await screen.findByText("Lesson not found.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  // Nav-flow audit: was a navigate(-1) button (fragile on a direct/shared/refreshed URL with no
  // useful history) -- no lesson data ever loaded here, so /courses is the safest destination.
  expect(screen.getByRole("link", { name: "Back to courses" })).toHaveAttribute("href", "/courses");
});

test("Exit lesson is a real link to the lesson's own course, not history-based", async () => {
  renderPlayer();
  await screen.findByText("A qubit has two states.");

  expect(screen.getByRole("link", { name: /Exit lesson/ })).toHaveAttribute("href", "/courses/3");
});

test("a lesson with a next lesson in sequence shows a 'Next lesson' link once complete", async () => {
  const user = userEvent.setup();
  attemptService.submit.mockResolvedValue({ isCorrect: true, xpAwarded: true });
  lessonService.getById.mockResolvedValue({ ...LESSON, next_lesson_id: 8 });
  renderPlayer();
  await screen.findByText("A qubit has two states.");
  await user.click(screen.getByRole("button", { name: /Next/ }));
  await user.click(screen.getByLabelText("Ground state"));
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText(/Correct!/);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Finish lesson" }));

  expect(screen.getByRole("link", { name: "Next lesson" })).toHaveAttribute("href", "/lessons/8");
});

test("shows real chapter/course orientation once the secondary context fetch resolves", async () => {
  renderPlayer();
  await screen.findByText("A qubit has two states.");

  expect(
    await screen.findByText("Quantum Computing Hardware · Chapter 2 of 3 · Lesson 1 of 2")
  ).toBeInTheDocument();
});

test("a progress-fetch failure for chapter context still renders the lesson, degrading gracefully", async () => {
  courseService.getById.mockRejectedValue(new Error("network down"));
  renderPlayer();

  expect(await screen.findByText("A qubit has two states.")).toBeInTheDocument();
  expect(screen.queryByText(/Chapter \d+ of \d+/)).not.toBeInTheDocument();
});

test("renders one progress dot per screen plus one for the lesson-complete step", async () => {
  const { container } = renderPlayer();
  await screen.findByText("A qubit has two states.");

  // 3 screens (SCREENS fixture) + 1 for the lesson-complete step.
  expect(container.querySelectorAll(".lesson-player__dot")).toHaveLength(4);
  expect(container.querySelector(".lesson-player__dot--current")).toHaveAttribute(
    "aria-current",
    "step"
  );
});

test("renders a sibling-lesson outline once chapter context resolves, with the current lesson marked", async () => {
  renderPlayer();
  await screen.findByText("A qubit has two states.");

  const outline = await screen.findByRole("complementary", { name: "Chapter lessons" });
  expect(within(outline).getByText("Superposition")).toBeInTheDocument();
  const currentLink = within(outline).getByRole("link", { name: /Qubits 101/ });
  expect(currentLink).toHaveAttribute("aria-current", "page");
});

test("a generic fetch failure shows the error banner with a retry action that re-fetches", async () => {
  const user = userEvent.setup();
  lessonService.getById.mockRejectedValueOnce(new Error("network down"));
  renderPlayer();

  const banner = await screen.findByRole("alert");
  expect(banner).toHaveTextContent("Could not reach the server. Check your connection.");

  lessonService.getById.mockResolvedValue(LESSON);
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByRole("heading", { name: "Qubits 101" })).toBeInTheDocument();
});
