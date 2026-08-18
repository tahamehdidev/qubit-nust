import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumericContentForm } from "./NumericContentForm.jsx";

test("defaults correct value to 0 and leaves tolerance blank", () => {
  render(<NumericContentForm content={{}} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Correct value")).toHaveValue(0);
  expect(screen.getByLabelText("Tolerance (optional)")).toHaveValue(null);
});

test("renders the current content", () => {
  render(<NumericContentForm content={{ correctValue: 3.5, tolerance: 0.1 }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Correct value")).toHaveValue(3.5);
  expect(screen.getByLabelText("Tolerance (optional)")).toHaveValue(0.1);
});

test("changing correct value calls onChange with the updated number", () => {
  const onChange = vi.fn();
  render(<NumericContentForm content={{ correctValue: 3.5 }} onChange={onChange} />);

  fireEvent.change(screen.getByLabelText("Correct value"), { target: { value: "4" } });

  expect(onChange).toHaveBeenCalledWith({ correctValue: 4 });
});

test("clearing tolerance sets it to undefined rather than NaN", () => {
  const onChange = vi.fn();
  render(
    <NumericContentForm content={{ correctValue: 3.5, tolerance: 0.1 }} onChange={onChange} />
  );

  fireEvent.change(screen.getByLabelText("Tolerance (optional)"), { target: { value: "" } });

  expect(onChange).toHaveBeenCalledWith({ correctValue: 3.5, tolerance: undefined });
});

test("disabled prop disables both inputs", () => {
  render(<NumericContentForm content={{}} onChange={vi.fn()} disabled />);
  expect(screen.getByLabelText("Correct value")).toBeDisabled();
  expect(screen.getByLabelText("Tolerance (optional)")).toBeDisabled();
});
