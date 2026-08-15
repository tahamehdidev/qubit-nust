import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ScreenForm } from "./ScreenForm.jsx";

vi.mock("../../services/screen.service.js", () => ({
  screenService: { attachQuestion: vi.fn(), detachQuestion: vi.fn() },
}));
vi.mock("../../services/question.service.js", () => ({
  questionService: { list: vi.fn().mockResolvedValue({ questions: [], pagination: { page: 1, limit: 10, total: 0 } }) },
}));

test("renders the explanation sub-form when type is explanation", () => {
  render(
    <ScreenForm
      type="explanation"
      content={{ text: "Hi" }}
      onTypeChange={vi.fn()}
      onContentChange={vi.fn()}
    />
  );
  expect(screen.getByLabelText("Text")).toHaveValue("Hi");
});

test("renders a save-first note for a question screen with no screenId yet (create mode)", () => {
  render(
    <ScreenForm type="question" content={{}} onTypeChange={vi.fn()} onContentChange={vi.fn()} />
  );
  expect(screen.getByText(/Save this screen first/)).toBeInTheDocument();
});

test("renders an attach-a-question button for a question screen with a screenId (edit mode)", () => {
  render(
    <MemoryRouter>
      <ScreenForm
        type="question"
        content={{}}
        onTypeChange={vi.fn()}
        onContentChange={vi.fn()}
        screenId="1000"
        attachedQuestion={null}
        onQuestionAttached={vi.fn()}
        onQuestionDetached={vi.fn()}
      />
    </MemoryRouter>
  );
  expect(screen.getByRole("button", { name: "Attach a question" })).toBeInTheDocument();
});

test("renders the simulation sub-form when type is simulation", () => {
  render(
    <ScreenForm
      type="simulation"
      content={{ widgetType: "bloch_sphere", params: { mode: "free_placement" } }}
      onTypeChange={vi.fn()}
      onContentChange={vi.fn()}
    />
  );
  expect(screen.getByLabelText("Widget type")).toBeInTheDocument();
});

test("switching the screen type calls onTypeChange with that type's default content", async () => {
  const user = userEvent.setup();
  const onTypeChange = vi.fn();
  render(
    <ScreenForm
      type="explanation"
      content={{ text: "Hi" }}
      onTypeChange={onTypeChange}
      onContentChange={vi.fn()}
    />
  );

  await user.selectOptions(screen.getByLabelText("Screen type"), "simulation");

  expect(onTypeChange).toHaveBeenCalledWith("simulation", {
    widgetType: "bloch_sphere",
    params: { mode: "free_placement" },
  });
});
