import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GateCircuitDiagram } from "./GateCircuitDiagram.jsx";
import { bellStateCircuitParams, threeQubitCircuitParams } from "./GateCircuitDiagram.fixtures.js";

test("renders the caption and one qubit label per qubit", () => {
  render(<GateCircuitDiagram params={bellStateCircuitParams} />);

  expect(screen.getByText(bellStateCircuitParams.caption)).toBeInTheDocument();
  expect(screen.getByText("q0")).toBeInTheDocument();
  expect(screen.getByText("q1")).toBeInTheDocument();
});

test("renders a real, focusable button per gate, with a descriptive accessible name", () => {
  render(<GateCircuitDiagram params={bellStateCircuitParams} />);

  expect(screen.getByRole("button", { name: "Hadamard gate on q0, step 1" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "CNOT gate, control q0, target q1, step 2" })
  ).toBeInTheDocument();
});

test("prompts to click a gate before anything is selected", () => {
  render(<GateCircuitDiagram params={bellStateCircuitParams} />);
  expect(screen.getByRole("status")).toHaveTextContent("Click a gate to learn what it does.");
});

test("clicking a single-qubit gate shows its description and marks it pressed", async () => {
  const user = userEvent.setup();
  render(<GateCircuitDiagram params={bellStateCircuitParams} />);

  const hGate = screen.getByRole("button", { name: "Hadamard gate on q0, step 1" });
  await user.click(hGate);

  expect(screen.getByRole("status")).toHaveTextContent(
    "Hadamard (H) -- creates an equal superposition from a definite state."
  );
  expect(hGate).toHaveAttribute("aria-pressed", "true");
});

test("clicking the CNOT gate shows its description", async () => {
  const user = userEvent.setup();
  render(<GateCircuitDiagram params={bellStateCircuitParams} />);

  await user.click(
    screen.getByRole("button", { name: "CNOT gate, control q0, target q1, step 2" })
  );

  expect(screen.getByRole("status")).toHaveTextContent(
    "Controlled-NOT (CNOT) -- flips the target qubit only when the control qubit is |1⟩."
  );
});

test("clicking a selected gate again deselects it", async () => {
  const user = userEvent.setup();
  render(<GateCircuitDiagram params={bellStateCircuitParams} />);

  const hGate = screen.getByRole("button", { name: "Hadamard gate on q0, step 1" });
  await user.click(hGate);
  await user.click(hGate);

  expect(screen.getByRole("status")).toHaveTextContent("Click a gate to learn what it does.");
  expect(hGate).toHaveAttribute("aria-pressed", "false");
});

test("selecting a different gate moves the selection rather than stacking it", async () => {
  const user = userEvent.setup();
  render(<GateCircuitDiagram params={bellStateCircuitParams} />);

  const hGate = screen.getByRole("button", { name: "Hadamard gate on q0, step 1" });
  const cnotGate = screen.getByRole("button", {
    name: "CNOT gate, control q0, target q1, step 2",
  });

  await user.click(hGate);
  await user.click(cnotGate);

  expect(hGate).toHaveAttribute("aria-pressed", "false");
  expect(cnotGate).toHaveAttribute("aria-pressed", "true");
});

test("defaults qubit labels to q0, q1, ... when qubitLabels is omitted", () => {
  render(<GateCircuitDiagram params={threeQubitCircuitParams} />);
  expect(screen.getByText("q0")).toBeInTheDocument();
  expect(screen.getByText("q1")).toBeInTheDocument();
  expect(screen.getByText("q2")).toBeInTheDocument();
});

test("renders a measurement gate on each of its qubits", () => {
  render(<GateCircuitDiagram params={threeQubitCircuitParams} />);
  expect(
    screen.getByRole("button", { name: "Measurement gate on q0, step 4" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Measurement gate on q1, step 4" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Measurement gate on q2, step 4" })
  ).toBeInTheDocument();
});
