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

test("renders a stub note for a widget type with no authoring form yet", () => {
  render(
    <SimulationScreenForm content={{ widgetType: "topology_diagram", params: {} }} onChange={vi.fn()} />
  );
  expect(screen.getByText(/authoring form isn/)).toBeInTheDocument();
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
