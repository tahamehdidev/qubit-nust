import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopologyDiagramParamsForm } from "./TopologyDiagramParamsForm.jsx";

const QUBITS = [
  { id: 0, x: 0, y: 0, label: "Q0" },
  { id: 1, x: 1, y: 0, label: "Q1" },
];

test("shows empty messages when there are no qubits or edges", () => {
  render(<TopologyDiagramParamsForm params={{}} onChange={vi.fn()} />);
  expect(screen.getByText("No qubits yet.")).toBeInTheDocument();
  expect(screen.getByText("No edges yet.")).toBeInTheDocument();
});

test("adding a qubit assigns the next unused id", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<TopologyDiagramParamsForm params={{ qubits: QUBITS, edges: [] }} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Add qubit" }));

  expect(onChange).toHaveBeenCalledWith({
    qubits: [...QUBITS, { id: 2, x: 0, y: 0, label: "" }],
    edges: [],
  });
});

test("the edge add button is disabled with fewer than two qubits", () => {
  render(<TopologyDiagramParamsForm params={{ qubits: [QUBITS[0]], edges: [] }} onChange={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Add edge" })).toBeDisabled();
});

test("adding an edge defaults to connecting the first two qubits", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<TopologyDiagramParamsForm params={{ qubits: QUBITS, edges: [] }} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Add edge" }));

  expect(onChange).toHaveBeenCalledWith({ qubits: QUBITS, edges: [[0, 1]] });
});

test("edge selects list each qubit by label", () => {
  render(<TopologyDiagramParamsForm params={{ qubits: QUBITS, edges: [[0, 1]] }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("From qubit")).toHaveValue("0");
  expect(screen.getByLabelText("To qubit")).toHaveValue("1");
});

test("removing a qubit does not renumber the remaining qubits' ids", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const threeQubits = [...QUBITS, { id: 2, x: 0, y: 1, label: "Q2" }];
  render(<TopologyDiagramParamsForm params={{ qubits: threeQubits, edges: [] }} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Remove row 1" }));

  expect(onChange).toHaveBeenCalledWith({ qubits: [QUBITS[1], threeQubits[2]], edges: [] });
});
