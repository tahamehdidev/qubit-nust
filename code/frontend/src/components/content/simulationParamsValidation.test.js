import { test, expect } from "vitest";
import { validateSimulationParams } from "./simulationParamsValidation.js";

test("returns null for a widget type with no registered validator", () => {
  expect(validateSimulationParams("bloch_sphere", { mode: "free_placement" })).toBeNull();
});

test("amplitude_bar_chart: requires at least one amplitude", () => {
  expect(validateSimulationParams("amplitude_bar_chart", { amplitudes: [] })).toMatch(
    /at least one/
  );
});

test("amplitude_bar_chart: rejects a non-numeric amplitude", () => {
  expect(validateSimulationParams("amplitude_bar_chart", { amplitudes: [0.5, "oops"] })).toMatch(
    /number/
  );
});

test("amplitude_bar_chart: rejects mismatched labels/amplitudes length", () => {
  expect(
    validateSimulationParams("amplitude_bar_chart", {
      amplitudes: [0.5, 0.5],
      labels: ["only one"],
    })
  ).toMatch(/same number/);
});

test("amplitude_bar_chart: rejects an out-of-range highlightedIndex", () => {
  expect(
    validateSimulationParams("amplitude_bar_chart", { amplitudes: [0.5], highlightedIndex: 5 })
  ).toMatch(/refer to one of/);
});

test("amplitude_bar_chart: accepts a well-formed shape", () => {
  expect(
    validateSimulationParams("amplitude_bar_chart", {
      amplitudes: [0.5, -0.5],
      labels: ["0", "1"],
      highlightedIndex: 1,
    })
  ).toBeNull();
});

test("topology_diagram: requires at least one qubit", () => {
  expect(validateSimulationParams("topology_diagram", { qubits: [], edges: [] })).toMatch(
    /at least one/
  );
});

test("topology_diagram: rejects an edge referencing a nonexistent qubit", () => {
  expect(
    validateSimulationParams("topology_diagram", {
      qubits: [{ id: 0, x: 0, y: 0 }],
      edges: [[0, 99]],
    })
  ).toMatch(/qubits that exist/);
});

test("topology_diagram: accepts a well-formed shape", () => {
  expect(
    validateSimulationParams("topology_diagram", {
      qubits: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 1, y: 0 },
      ],
      edges: [[0, 1]],
    })
  ).toBeNull();
});

test("quadrant_selector: requires both axis labels", () => {
  expect(validateSimulationParams("quadrant_selector", {})).toMatch(/axis labels/);
});

test("quadrant_selector: requires exactly four quadrants", () => {
  expect(
    validateSimulationParams("quadrant_selector", {
      xAxisLabel: "X",
      yAxisLabel: "Y",
      xAxisValues: ["a", "b"],
      yAxisValues: ["c", "d"],
      quadrants: [{ label: "l", description: "d" }],
    })
  ).toMatch(/four quadrants/);
});

test("quadrant_selector: accepts a well-formed shape", () => {
  const quadrant = { label: "l", description: "d", highlighted: false };
  expect(
    validateSimulationParams("quadrant_selector", {
      xAxisLabel: "X",
      yAxisLabel: "Y",
      xAxisValues: ["a", "b"],
      yAxisValues: ["c", "d"],
      quadrants: [quadrant, quadrant, quadrant, quadrant],
    })
  ).toBeNull();
});

test("basis_encoder: rejects a non-positive qubit count", () => {
  expect(validateSimulationParams("basis_encoder", { qubitCount: 0, defaultNumber: 0 })).toMatch(
    /positive/
  );
});

test("basis_encoder: accepts a well-formed shape", () => {
  expect(validateSimulationParams("basis_encoder", { qubitCount: 3, defaultNumber: 6 })).toBeNull();
});
