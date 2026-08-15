import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExplanationScreenForm } from "./ExplanationScreenForm.jsx";

test("renders the text field with its current value", () => {
  render(<ExplanationScreenForm content={{ text: "Hello" }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Text")).toHaveValue("Hello");
});

test("editing the textarea calls onChange with the full updated text", () => {
  const onChange = vi.fn();
  render(<ExplanationScreenForm content={{ text: "" }} onChange={onChange} />);

  fireEvent.change(screen.getByLabelText("Text"), { target: { value: "New explanation" } });

  expect(onChange).toHaveBeenCalledWith({ text: "New explanation" });
});

test("disabled prop disables the textarea", () => {
  render(<ExplanationScreenForm content={{ text: "" }} onChange={vi.fn()} disabled />);
  expect(screen.getByLabelText("Text")).toBeDisabled();
});
