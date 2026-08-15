import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McqContentForm } from "./McqContentForm.jsx";

const CONTENT = { options: ["A", "B", "C"], correctOptionIndex: 1 };

test("renders one input per option with their current values", () => {
  render(<McqContentForm content={CONTENT} onChange={vi.fn()} />);
  const optionInputs = screen.getAllByLabelText(/Option \d/);
  expect(optionInputs.map((input) => input.value)).toEqual(["A", "B", "C"]);
});

test("marks the correct option's radio as checked", () => {
  render(<McqContentForm content={CONTENT} onChange={vi.fn()} />);
  const radios = screen.getAllByRole("radio");
  expect(radios[1]).toBeChecked();
  expect(radios[0]).not.toBeChecked();
});

test("clicking a different option's radio updates correctOptionIndex", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<McqContentForm content={CONTENT} onChange={onChange} />);

  await user.click(screen.getAllByRole("radio")[2]);

  expect(onChange).toHaveBeenCalledWith({ ...CONTENT, correctOptionIndex: 2 });
});

test("editing an option's text updates that option in place", () => {
  const onChange = vi.fn();
  render(<McqContentForm content={CONTENT} onChange={onChange} />);

  fireEvent.change(screen.getByLabelText("Option 1"), { target: { value: "Z" } });

  expect(onChange).toHaveBeenCalledWith({ ...CONTENT, options: ["Z", "B", "C"] });
});

test("adding an option appends an empty one", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<McqContentForm content={CONTENT} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Add option" }));

  expect(onChange).toHaveBeenCalledWith({ ...CONTENT, options: ["A", "B", "C", ""] });
});

test("removing the correct option resets correctOptionIndex to 0", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<McqContentForm content={CONTENT} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Remove row 2" }));

  expect(onChange).toHaveBeenCalledWith({ options: ["A", "C"], correctOptionIndex: 0 });
});

test("removing an option before the correct one decrements correctOptionIndex, keeping the same option correct", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<McqContentForm content={CONTENT} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Remove row 1" }));

  // "B" was correct (index 1); removing "A" (index 0) shifts B to index 0 -- correctOptionIndex
  // must follow B, not silently point at whatever ended up at position 1.
  expect(onChange).toHaveBeenCalledWith({ options: ["B", "C"], correctOptionIndex: 0 });
});

test("removing an option after the correct one leaves correctOptionIndex unchanged", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<McqContentForm content={CONTENT} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Remove row 3" }));

  expect(onChange).toHaveBeenCalledWith({ options: ["A", "B"], correctOptionIndex: 1 });
});
