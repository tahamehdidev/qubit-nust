import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SimulationScreenForm } from "./SimulationScreenForm.jsx";

test("renders the Bloch sphere params form for widgetType bloch_sphere", () => {
  render(
    <SimulationScreenForm
      content={{ widgetType: "bloch_sphere", params: { mode: "free_placement" } }}
      onChange={vi.fn()}
    />
  );
  expect(screen.getByLabelText("Mode")).toBeInTheDocument();
});

test("renders the gate circuit params form for widgetType gate_circuit_diagram", () => {
  render(
    <SimulationScreenForm
      content={{ widgetType: "gate_circuit_diagram", params: { qubitCount: 1, gates: [] } }}
      onChange={vi.fn()}
    />
  );
  expect(screen.getByLabelText("Qubit count")).toBeInTheDocument();
});

test("renders the amplitude bar chart params form for widgetType amplitude_bar_chart", () => {
  render(
    <SimulationScreenForm
      content={{ widgetType: "amplitude_bar_chart", params: { amplitudes: [], labels: [] } }}
      onChange={vi.fn()}
    />
  );
  expect(screen.getByText("No basis states yet.")).toBeInTheDocument();
});

test("renders the topology diagram params form for widgetType topology_diagram", () => {
  render(
    <SimulationScreenForm
      content={{ widgetType: "topology_diagram", params: { qubits: [], edges: [] } }}
      onChange={vi.fn()}
    />
  );
  expect(screen.getByText("No qubits yet.")).toBeInTheDocument();
});

test("renders the quadrant selector params form for widgetType quadrant_selector", () => {
  render(
    <SimulationScreenForm
      content={{
        widgetType: "quadrant_selector",
        params: {
          xAxisLabel: "X",
          yAxisLabel: "Y",
          xAxisValues: ["a", "b"],
          yAxisValues: ["c", "d"],
          quadrants: [
            { label: "", description: "", highlighted: true },
            { label: "", description: "", highlighted: false },
            { label: "", description: "", highlighted: false },
            { label: "", description: "", highlighted: false },
          ],
        },
      }}
      onChange={vi.fn()}
    />
  );
  expect(screen.getByLabelText("X axis label")).toHaveValue("X");
});

test("renders the basis encoder params form for widgetType basis_encoder", () => {
  render(
    <SimulationScreenForm
      content={{ widgetType: "basis_encoder", params: { qubitCount: 3, defaultNumber: 6 } }}
      onChange={vi.fn()}
    />
  );
  expect(screen.getByLabelText("Default number")).toHaveValue(6);
});

test("switching widgetType calls onChange with that type's default params", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <SimulationScreenForm
      content={{ widgetType: "bloch_sphere", params: { mode: "free_placement" } }}
      onChange={onChange}
    />
  );

  await user.selectOptions(screen.getByLabelText("Widget type"), "gate_circuit_diagram");

  expect(onChange).toHaveBeenCalledWith({
    widgetType: "gate_circuit_diagram",
    params: { qubitCount: 1, gates: [] },
  });
});
