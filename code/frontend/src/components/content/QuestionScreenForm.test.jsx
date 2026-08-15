import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { screenService } from "../../services/screen.service.js";
import { questionService } from "../../services/question.service.js";
import { QuestionScreenForm } from "./QuestionScreenForm.jsx";

vi.mock("../../services/screen.service.js", () => ({
  screenService: { attachQuestion: vi.fn(), detachQuestion: vi.fn() },
}));
vi.mock("../../services/question.service.js", () => ({
  questionService: { list: vi.fn() },
}));

const QUESTION = { id: 7, prompt: "What is 2+2?", type: "mcq" };

function renderForm(props = {}) {
  return render(
    <MemoryRouter>
      <QuestionScreenForm
        screenId="1000"
        attachedQuestion={null}
        onQuestionAttached={vi.fn()}
        onQuestionDetached={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  questionService.list.mockResolvedValue({
    questions: [QUESTION],
    pagination: { page: 1, limit: 10, total: 1 },
  });
});

test("shows a save-first note when there is no screenId yet", () => {
  renderForm({ screenId: undefined });
  expect(screen.getByText(/Save this screen first/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Attach a question" })).not.toBeInTheDocument();
});

test("shows an attach button with no question attached", () => {
  renderForm();
  expect(screen.getByRole("button", { name: "Attach a question" })).toBeInTheDocument();
});

test("shows the attached question's prompt with Change/Detach actions", () => {
  renderForm({ attachedQuestion: QUESTION });
  expect(screen.getByText("What is 2+2?")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Detach" })).toBeInTheDocument();
});

test("picking a question in the modal attaches it and calls onQuestionAttached", async () => {
  const user = userEvent.setup();
  const onQuestionAttached = vi.fn();
  screenService.attachQuestion.mockResolvedValue(undefined);
  renderForm({ onQuestionAttached });

  await user.click(screen.getByRole("button", { name: "Attach a question" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(await within(dialog).findByRole("button", { name: "Use this question" }));

  expect(screenService.attachQuestion).toHaveBeenCalledWith("1000", 7);
  expect(onQuestionAttached).toHaveBeenCalledWith(QUESTION);
});

test("clicking Detach calls detachQuestion and onQuestionDetached", async () => {
  const user = userEvent.setup();
  const onQuestionDetached = vi.fn();
  screenService.detachQuestion.mockResolvedValue(undefined);
  renderForm({ attachedQuestion: QUESTION, onQuestionDetached });

  await user.click(screen.getByRole("button", { name: "Detach" }));

  expect(screenService.detachQuestion).toHaveBeenCalledWith("1000", 7);
  expect(onQuestionDetached).toHaveBeenCalled();
});

test("a failed attach shows an error banner", async () => {
  const user = userEvent.setup();
  screenService.attachQuestion.mockRejectedValue({
    response: { data: { error: { code: "INTERNAL", message: "Attach failed." } } },
  });
  renderForm();

  await user.click(screen.getByRole("button", { name: "Attach a question" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(await within(dialog).findByRole("button", { name: "Use this question" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Attach failed.");
});
