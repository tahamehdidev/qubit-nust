import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BasisEncoderParamsForm } from "./BasisEncoderParamsForm.jsx";

test("defaults qubit count to 1 and default number to 0", () => {
  render(<BasisEncoderParamsForm params={{}} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Qubit count")).toHaveValue(1);
  expect(screen.getByLabelText("Default number")).toHaveValue(0);
});

test("renders the current params", () => {
  render(<BasisEncoderParamsForm params={{ qubitCount: 3, defaultNumber: 6, caption: "Try it" }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Qubit count")).toHaveValue(3);
  expect(screen.getByLabelText("Default number")).toHaveValue(6);
  expect(screen.getByLabelText("Caption (optional)")).toHaveValue("Try it");
});

test("changing qubit count calls onChange with the updated count", () => {
  const onChange = vi.fn();
  render(<BasisEncoderParamsForm params={{ qubitCount: 3, defaultNumber: 6 }} onChange={onChange} />);

  fireEvent.change(screen.getByLabelText("Qubit count"), { target: { value: "4" } });

  expect(onChange).toHaveBeenCalledWith({ qubitCount: 4, defaultNumber: 6 });
});

test("disabled prop disables all inputs", () => {
  render(<BasisEncoderParamsForm params={{}} onChange={vi.fn()} disabled />);
  expect(screen.getByLabelText("Qubit count")).toBeDisabled();
  expect(screen.getByLabelText("Default number")).toBeDisabled();
});
