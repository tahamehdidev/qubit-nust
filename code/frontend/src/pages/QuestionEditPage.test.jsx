import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { questionService } from "../services/question.service.js";
import { QuestionEditPage } from "./QuestionEditPage.jsx";

vi.mock("../services/question.service.js", () => ({
  questionService: { getById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const EXISTING_QUESTION = {
  id: 7,
  prompt: "What is 2+2?",
  type: "mcq",
  content: { options: ["3", "4"], correctOptionIndex: 1 },
  hint: "Count on your fingers.",
  explanation: "2+2 = 4.",
};

function renderPage(questionId) {
  return render(
    <MemoryRouter initialEntries={[`/admin/content/questions/${questionId}`]}>
      <Routes>
        <Route path="/admin/content/questions/:questionId" element={<QuestionEditPage />} />
        <Route path="/admin/content/questions" element={<div>Question bank page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const NEW_QUESTION = {
  id: 9,
  prompt: "New prompt",
  type: "mcq",
  content: { options: ["", ""], correctOptionIndex: 0 },
  hint: null,
  explanation: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  questionService.getById.mockResolvedValue(EXISTING_QUESTION);
});

test("create mode renders an empty MCQ form by default", async () => {
  renderPage("new");

  expect(await screen.findByRole("heading", { name: "New question" })).toBeInTheDocument();
  expect(screen.getByLabelText("Prompt")).toHaveValue("");
  expect(screen.getAllByLabelText(/Option \d/)).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Delete question" })).not.toBeInTheDocument();
});

test("submitting a new question calls create and navigates to its own edit page", async () => {
  const user = userEvent.setup();
  questionService.create.mockResolvedValue(NEW_QUESTION);
  questionService.getById.mockResolvedValue(NEW_QUESTION);
  renderPage("new");

  await user.type(await screen.findByLabelText("Prompt"), "New prompt");
  await user.click(screen.getByRole("button", { name: "Create question" }));

  expect(questionService.create).toHaveBeenCalledWith({
    prompt: "New prompt",
    type: "mcq",
    content: { options: ["", ""], correctOptionIndex: 0 },
    hint: undefined,
    explanation: undefined,
  });
  // Straight to the new question's own page, same "create then land on the detail page"
  // convention used by ContentCoursesPage -- it re-fetches by id rather than reusing the create
  // response in place, so this also proves the route actually re-renders in edit mode.
  expect(await screen.findByRole("heading", { name: "Edit question" })).toBeInTheDocument();
  expect(screen.getByLabelText("Prompt")).toHaveValue("New prompt");
});

test("edit mode pre-fills the existing question's fields", async () => {
  renderPage("7");

  expect(await screen.findByRole("heading", { name: "Edit question" })).toBeInTheDocument();
  expect(screen.getByLabelText("Prompt")).toHaveValue("What is 2+2?");
  expect(screen.getByLabelText("Hint (optional)")).toHaveValue("Count on your fingers.");
  expect(screen.getByLabelText("Explanation (optional)")).toHaveValue("2+2 = 4.");
  const optionInputs = screen.getAllByLabelText(/Option \d/);
  expect(optionInputs.map((input) => input.value)).toEqual(["3", "4"]);
});

test("saving an edit calls update and shows a confirmation", async () => {
  const user = userEvent.setup();
  questionService.update.mockResolvedValue({ ...EXISTING_QUESTION, prompt: "Updated" });
  renderPage("7");

  const promptInput = await screen.findByLabelText("Prompt");
  await user.clear(promptInput);
  await user.type(promptInput, "Updated");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(questionService.update).toHaveBeenCalledWith("7", {
    prompt: "Updated",
    type: "mcq",
    content: { options: ["3", "4"], correctOptionIndex: 1 },
    hint: "Count on your fingers.",
    explanation: "2+2 = 4.",
  });
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
});

test("switching type resets content to that type's default", async () => {
  const user = userEvent.setup();
  renderPage("7");

  await screen.findByLabelText("Prompt");
  await user.selectOptions(screen.getByLabelText("Type"), "numeric");

  expect(screen.queryByLabelText(/Option \d/)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Correct value")).toBeInTheDocument();
});

test("an unknown question shows an error state", async () => {
  questionService.getById.mockRejectedValue({
    response: { data: { error: { code: "NOT_FOUND", message: "Question not found." } } },
  });
  renderPage("9999");

  expect(await screen.findByRole("alert")).toHaveTextContent("Question not found.");
});

test("deleting the question shows the pointed cascade warning, then removes it and navigates back", async () => {
  const user = userEvent.setup();
  questionService.remove.mockResolvedValue(undefined);
  renderPage("7");

  await user.click(await screen.findByRole("button", { name: "Delete question" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(
    "This will remove the question from every screen and practice set that currently uses it."
  );
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  expect(questionService.remove).toHaveBeenCalledWith("7");
  expect(await screen.findByText("Question bank page")).toBeInTheDocument();
});
