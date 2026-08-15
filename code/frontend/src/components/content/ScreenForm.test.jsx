import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScreenForm } from "./ScreenForm.jsx";

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

test("renders a stub note when type is question", () => {
  render(
    <ScreenForm type="question" content={{}} onTypeChange={vi.fn()} onContentChange={vi.fn()} />
  );
  expect(screen.getByText(/authorable here yet/)).toBeInTheDocument();
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
