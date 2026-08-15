import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionForm } from "./QuestionForm.jsx";

function renderForm(props = {}) {
  return render(
    <QuestionForm
      prompt="What is 2+2?"
      onPromptChange={vi.fn()}
      hint=""
      onHintChange={vi.fn()}
      explanation=""
      onExplanationChange={vi.fn()}
      type="mcq"
      content={{ options: ["3", "4"], correctOptionIndex: 1 }}
      onTypeChange={vi.fn()}
      onContentChange={vi.fn()}
      {...props}
    />
  );
}

test("renders the prompt/hint/explanation fields alongside the type-specific sub-form", () => {
  renderForm();
  expect(screen.getByLabelText("Prompt")).toHaveValue("What is 2+2?");
  expect(screen.getByLabelText("Hint (optional)")).toHaveValue("");
  expect(screen.getByLabelText("Explanation (optional)")).toHaveValue("");
  expect(screen.getAllByLabelText(/Option \d/)).toHaveLength(2);
});

test("renders the drag-drop sub-form for type drag_drop", () => {
  renderForm({ type: "drag_drop", content: { items: ["A", "B"], correctOrder: [0, 1] } });
  expect(screen.getAllByLabelText(/Item \d/)).toHaveLength(2);
});

test("renders the numeric sub-form for type numeric", () => {
  renderForm({ type: "numeric", content: { correctValue: 5 } });
  expect(screen.getByLabelText("Correct value")).toHaveValue(5);
});

test("switching type calls onTypeChange with that type's default content", async () => {
  const user = userEvent.setup();
  const onTypeChange = vi.fn();
  renderForm({ onTypeChange });

  await user.selectOptions(screen.getByLabelText("Type"), "numeric");

  expect(onTypeChange).toHaveBeenCalledWith("numeric", { correctValue: 0 });
});

test("editing the prompt calls onPromptChange", async () => {
  const user = userEvent.setup();
  const onPromptChange = vi.fn();
  renderForm({ prompt: "", onPromptChange });

  await user.type(screen.getByLabelText("Prompt"), "Hi");

  expect(onPromptChange).toHaveBeenCalled();
});

test("disabled prop disables the prompt field", () => {
  renderForm({ disabled: true });
  expect(screen.getByLabelText("Prompt")).toBeDisabled();
});
