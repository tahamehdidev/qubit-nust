import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuadrantSelectorParamsForm } from "./QuadrantSelectorParamsForm.jsx";

const PARAMS = {
  xAxisLabel: "Processing device",
  yAxisLabel: "Data",
  xAxisValues: ["Classical", "Quantum"],
  yAxisValues: ["Classical", "Quantum"],
  quadrants: [
    { label: "CC", description: "classical/classical", highlighted: false },
    { label: "CQ", description: "classical/quantum", highlighted: true },
    { label: "QC", description: "quantum/classical", highlighted: false },
    { label: "QQ", description: "quantum/quantum", highlighted: false },
  ],
};

test("renders four quadrant rows with their combo label", () => {
  render(<QuadrantSelectorParamsForm params={PARAMS} onChange={vi.fn()} />);
  expect(screen.getByText(/Classical.*Classical/)).toBeInTheDocument();
  expect(screen.getByText(/Quantum.*Quantum/)).toBeInTheDocument();
  const labelInputs = screen.getAllByLabelText("Label");
  expect(labelInputs).toHaveLength(4);
  expect(labelInputs[1]).toHaveValue("CQ");
});

test("exactly one quadrant's highlighted radio is checked", () => {
  render(<QuadrantSelectorParamsForm params={PARAMS} onChange={vi.fn()} />);
  const radios = screen.getAllByRole("radio");
  expect(radios.filter((r) => r.checked)).toHaveLength(1);
  expect(radios[1]).toBeChecked();
});

test("selecting a different highlighted quadrant clears the others", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<QuadrantSelectorParamsForm params={PARAMS} onChange={onChange} />);

  const radios = screen.getAllByRole("radio");
  await user.click(radios[3]);

  expect(onChange).toHaveBeenCalledWith({
    ...PARAMS,
    quadrants: [
      { ...PARAMS.quadrants[0], highlighted: false },
      { ...PARAMS.quadrants[1], highlighted: false },
      { ...PARAMS.quadrants[2], highlighted: false },
      { ...PARAMS.quadrants[3], highlighted: true },
    ],
  });
});

test("editing an x axis value keeps the other value in place", () => {
  const onChange = vi.fn();
  render(<QuadrantSelectorParamsForm params={PARAMS} onChange={onChange} />);

  fireEvent.change(screen.getByLabelText("X value 1"), { target: { value: "Hybrid" } });

  expect(onChange).toHaveBeenCalledWith({ ...PARAMS, xAxisValues: ["Hybrid", "Quantum"] });
});

test("defaults to a blank quadrant set when params has no quadrants yet", () => {
  render(<QuadrantSelectorParamsForm params={{}} onChange={vi.fn()} />);
  expect(screen.getAllByLabelText("Label")).toHaveLength(4);
  expect(screen.getAllByRole("radio").filter((r) => r.checked)).toHaveLength(1);
});
