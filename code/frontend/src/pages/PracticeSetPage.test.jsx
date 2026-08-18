import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { practiceSetService } from "../services/practiceSet.service.js";
import { attemptService } from "../services/attempt.service.js";
import { PracticeSetPage } from "./PracticeSetPage.jsx";

vi.mock("../services/practiceSet.service.js", () => ({
  practiceSetService: { getById: vi.fn() },
}));
vi.mock("../services/attempt.service.js", () => ({
  attemptService: { submit: vi.fn() },
}));

const PRACTICE_SET = {
  id: 300,
  lesson_id: 7,
  title: "Practice: Why Superconducting Circuits Won the Scale Race",
  questions: [
    {
      id: 3005,
      type: "mcq",
      prompt: "Name the four major physical qubit platforms covered in this lesson.",
      content: {
        options: ["superconducting circuits.", "Distractor A", "Distractor B", "Distractor C"],
      },
    },
    {
      id: 3006,
      type: "mcq",
      prompt: "Which platform is known for very long coherence times?",
      content: { options: ["trapped ions.", "Distractor A", "Distractor B", "Distractor C"] },
    },
  ],
};

function renderPracticeSet(practiceSetId = "300") {
  return render(
    <MemoryRouter initialEntries={[`/practice-sets/${practiceSetId}`]}>
      <Routes>
        <Route path="/practice-sets/:practiceSetId" element={<PracticeSetPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  practiceSetService.getById.mockResolvedValue(PRACTICE_SET);
});

test("fetches the practice set and shows the first question", async () => {
  renderPracticeSet();

  expect(
    await screen.findByRole("heading", {
      name: "Practice: Why Superconducting Circuits Won the Scale Race",
    })
  ).toBeInTheDocument();
  expect(practiceSetService.getById).toHaveBeenCalledWith("300");
  expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
  expect(
    screen.getByText("Name the four major physical qubit platforms covered in this lesson.")
  ).toBeInTheDocument();
});

test("Next is disabled until the question is answered correctly, then advances", async () => {
  const user = userEvent.setup();
  attemptService.submit.mockResolvedValue({ isCorrect: true, xpAwarded: true });
  renderPracticeSet();
  await screen.findByText("Question 1 of 2");

  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

  await user.click(screen.getByLabelText("superconducting circuits."));
  await user.click(screen.getByRole("button", { name: "Submit" }));

  expect(await screen.findByText(/Correct!/)).toBeInTheDocument();
  expect(attemptService.submit).toHaveBeenCalledWith({
    questionId: 3005,
    contextType: "practice_set",
    contextId: 300,
    answer: { selectedOptionIndex: 0 },
  });
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
});

test("an incorrect answer does not unlock Next; retrying and getting it correct does", async () => {
  const user = userEvent.setup();
  attemptService.submit.mockResolvedValueOnce({ isCorrect: false, xpAwarded: false });
  renderPracticeSet();
  await screen.findByText("Question 1 of 2");

  await user.click(screen.getByLabelText("superconducting circuits."));
  await user.click(screen.getByRole("button", { name: "Submit" }));

  expect(await screen.findByText(/Not quite/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

  attemptService.submit.mockResolvedValueOnce({ isCorrect: true, xpAwarded: true });
  await user.click(screen.getByRole("button", { name: "Try Again" }));
  // Elimination-on-retry (Frontend Milestone 6) disables the just-submitted wrong option going
  // forward, matching a real learner who's already been told that answer is wrong.
  expect(screen.getByLabelText("superconducting circuits.")).toBeDisabled();
  await user.click(screen.getByLabelText("Distractor A"));
  await user.click(screen.getByRole("button", { name: "Submit" }));

  expect(await screen.findByText(/Correct!/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});

// Both questions get answered correctly in this test, so once question 2 is answered, "Correct!"
// exists twice in the DOM at once (question 1's hidden-but-mounted copy plus question 2's) --
// queries below are scoped to the currently-visible question container to disambiguate.
function visibleQuestion() {
  return within(document.querySelector(".practice-set__question:not([hidden])"));
}

test("Finish practice shows the completion state; Back returns to the last question with its graded state preserved", async () => {
  const user = userEvent.setup();
  attemptService.submit.mockResolvedValue({ isCorrect: true, xpAwarded: true });
  renderPracticeSet();
  await screen.findByText("Question 1 of 2");
  await user.click(screen.getByLabelText("superconducting circuits."));
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText(/Correct!/);
  await user.click(screen.getByRole("button", { name: "Next" }));

  await user.click(screen.getByLabelText("trapped ions."));
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await visibleQuestion().findByText(/Correct!/);

  await user.click(screen.getByRole("button", { name: "Finish practice" }));
  expect(screen.getByText("Practice complete!")).toBeInTheDocument();
  expect(screen.getByText("No mistakes — nice work!")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to lesson" })).toHaveAttribute(
    "href",
    "/lessons/7"
  );

  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(visibleQuestion().getByText(/Correct!/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Finish practice" })).toBeEnabled();
  expect(attemptService.submit).toHaveBeenCalledTimes(2);
});

test("the completion summary reports how many questions needed a retry", async () => {
  const user = userEvent.setup();
  renderPracticeSet();
  await screen.findByText("Question 1 of 2");

  attemptService.submit.mockResolvedValueOnce({ isCorrect: false, xpAwarded: false });
  await user.click(screen.getByLabelText("superconducting circuits."));
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText(/Not quite/);

  attemptService.submit.mockResolvedValueOnce({ isCorrect: true, xpAwarded: true });
  await user.click(screen.getByRole("button", { name: "Try Again" }));
  await user.click(screen.getByLabelText("Distractor A"));
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText(/Correct!/);
  await user.click(screen.getByRole("button", { name: "Next" }));

  attemptService.submit.mockResolvedValueOnce({ isCorrect: true, xpAwarded: true });
  await user.click(screen.getByLabelText("trapped ions."));
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await visibleQuestion().findByText(/Correct!/);
  await user.click(screen.getByRole("button", { name: "Finish practice" }));

  expect(screen.getByText("You got there — 1 of 2 took a retry.")).toBeInTheDocument();
});

test("shows the question count in the header", async () => {
  renderPracticeSet();
  await screen.findByText("Question 1 of 2");

  expect(screen.getByText("2 questions")).toBeInTheDocument();
});

test("renders one progress dot per question plus one for the practice-complete step", async () => {
  const { container } = renderPracticeSet();
  await screen.findByText("Question 1 of 2");

  expect(container.querySelectorAll(".practice-set__dot")).toHaveLength(3);
  expect(container.querySelector(".practice-set__dot--current")).toHaveAttribute(
    "aria-current",
    "step"
  );
});

test("the completion breakdown marks only the retried question, not the clean one", async () => {
  const user = userEvent.setup();
  renderPracticeSet();
  await screen.findByText("Question 1 of 2");

  attemptService.submit.mockResolvedValueOnce({ isCorrect: false, xpAwarded: false });
  await user.click(screen.getByLabelText("superconducting circuits."));
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText(/Not quite/);

  attemptService.submit.mockResolvedValueOnce({ isCorrect: true, xpAwarded: true });
  await user.click(screen.getByRole("button", { name: "Try Again" }));
  await user.click(screen.getByLabelText("Distractor A"));
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText(/Correct!/);
  await user.click(screen.getByRole("button", { name: "Next" }));

  attemptService.submit.mockResolvedValueOnce({ isCorrect: true, xpAwarded: true });
  await user.click(screen.getByLabelText("trapped ions."));
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await visibleQuestion().findByText(/Correct!/);
  await user.click(screen.getByRole("button", { name: "Finish practice" }));

  const complete = within(screen.getByRole("status"));
  const breakdown = complete
    .getByText("Name the four major physical qubit platforms covered in this lesson.")
    .closest("li");
  expect(breakdown.querySelector(".practice-set__complete-row-icon--retried")).toBeInTheDocument();

  const cleanRow = complete
    .getByText("Which platform is known for very long coherence times?")
    .closest("li");
  expect(
    cleanRow.querySelector(".practice-set__complete-row-icon--retried")
  ).not.toBeInTheDocument();
});

test("a nonexistent practice set shows a 'not found' message with a real link back, no retry button", async () => {
  practiceSetService.getById.mockRejectedValue({
    response: { data: { error: { code: "NOT_FOUND", message: "Practice set not found." } } },
  });
  renderPracticeSet("999999");

  expect(await screen.findByText("Practice set not found.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  // Nav-flow audit: was a navigate(-1) button (fragile on a direct/shared/refreshed URL with no
  // useful history) -- no practiceSet data ever loaded here, so /courses is the safest destination.
  expect(screen.getByRole("link", { name: "Back to courses" })).toHaveAttribute("href", "/courses");
});

test("Exit practice is a real link to the practice set's own lesson, not history-based", async () => {
  renderPracticeSet();
  await screen.findByText("Question 1 of 2");

  expect(screen.getByRole("link", { name: /Exit practice/ })).toHaveAttribute("href", "/lessons/7");
});

test("a generic fetch failure shows the error banner with a retry action that re-fetches", async () => {
  const user = userEvent.setup();
  practiceSetService.getById.mockRejectedValueOnce(new Error("network down"));
  renderPracticeSet();

  const banner = await screen.findByRole("alert");
  expect(banner).toHaveTextContent("Could not reach the server. Check your connection.");

  practiceSetService.getById.mockResolvedValue(PRACTICE_SET);
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(
    await screen.findByRole("heading", {
      name: "Practice: Why Superconducting Circuits Won the Scale Race",
    })
  ).toBeInTheDocument();
});
