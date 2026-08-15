import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GateCircuitDiagramParamsForm } from "./GateCircuitDiagramParamsForm.jsx";

test("defaults qubit count to 1 and shows no gates message", () => {
  render(<GateCircuitDiagramParamsForm params={{}} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Qubit count")).toHaveValue(1);
  expect(screen.getByText("No gates yet.")).toBeInTheDocument();
});

test("changing qubit count calls onChange with the updated count", () => {
  const onChange = vi.fn();
  render(<GateCircuitDiagramParamsForm params={{ qubitCount: 1, gates: [] }} onChange={onChange} />);

  fireEvent.change(screen.getByLabelText("Qubit count"), { target: { value: "2" } });

  expect(onChange).toHaveBeenCalledWith({ qubitCount: 2, gates: [] });
});

test("renders one qubit-label input per qubit", () => {
  render(<GateCircuitDiagramParamsForm params={{ qubitCount: 2, gates: [] }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Qubit 0")).toBeInTheDocument();
  expect(screen.getByLabelText("Qubit 1")).toBeInTheDocument();
});

test("adding a gate appends a default H gate on qubit 0", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<GateCircuitDiagramParamsForm params={{ qubitCount: 1, gates: [] }} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Add gate" }));

  expect(onChange).toHaveBeenCalledWith({
    qubitCount: 1,
    gates: [{ type: "H", step: 0, qubits: [0] }],
  });
});

test("renders a row per existing gate with type, step, and qubit checkboxes", () => {
  render(
    <GateCircuitDiagramParamsForm
      params={{ qubitCount: 2, gates: [{ type: "CNOT", step: 1, qubits: [0, 1] }] }}
      onChange={vi.fn()}
    />
  );
  expect(screen.getByLabelText("Type")).toHaveValue("CNOT");
  expect(screen.getByLabelText("Step")).toHaveValue(1);
  expect(screen.getByRole("checkbox", { name: "0" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "1" })).toBeChecked();
});

test("removing a gate calls onChange with it filtered out", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <GateCircuitDiagramParamsForm
      params={{ qubitCount: 1, gates: [{ type: "H", step: 0, qubits: [0] }] }}
      onChange={onChange}
    />
  );

  await user.click(screen.getByRole("button", { name: "Remove gate 1" }));

  expect(onChange).toHaveBeenCalledWith({ qubitCount: 1, gates: [] });
});

test("unchecking a gate's qubit removes it from that gate's qubits list", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <GateCircuitDiagramParamsForm
      params={{ qubitCount: 2, gates: [{ type: "CNOT", step: 0, qubits: [0, 1] }] }}
      onChange={onChange}
    />
  );

  await user.click(screen.getByRole("checkbox", { name: "1" }));

  expect(onChange).toHaveBeenCalledWith({
    qubitCount: 2,
    gates: [{ type: "CNOT", step: 0, qubits: [0] }],
  });
});

test("disabled prop disables the add-gate button and inputs", () => {
  render(<GateCircuitDiagramParamsForm params={{ qubitCount: 1, gates: [] }} onChange={vi.fn()} disabled />);
  expect(screen.getByLabelText("Qubit count")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add gate" })).toBeDisabled();
});
