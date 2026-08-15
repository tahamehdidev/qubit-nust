import { useState } from "react";
import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BlochSphereParamsForm } from "./BlochSphereParamsForm.jsx";

// A stateful wrapper for the one test that needs to observe a controlled re-render (selecting
// "custom" revealing the tuple inputs) -- every other test only needs to assert what onChange
// was called with, since the component itself doesn't own state.
function StatefulForm({ initialParams }) {
  const [params, setParams] = useState(initialParams);
  return <BlochSphereParamsForm params={params} onChange={setParams} />;
}

test("defaults mode to free_placement and start state to 0", () => {
  render(<BlochSphereParamsForm params={{}} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Mode")).toHaveValue("free_placement");
  expect(screen.getByLabelText("Start state")).toHaveValue("0");
});

test("changing mode calls onChange with the updated mode, preserving other params", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<BlochSphereParamsForm params={{ mode: "free_placement" }} onChange={onChange} />);

  await user.selectOptions(screen.getByLabelText("Mode"), "t1_decay");

  expect(onChange).toHaveBeenCalledWith({ mode: "t1_decay" });
});

test("gate_application mode shows the available-gates checkboxes", () => {
  render(
    <BlochSphereParamsForm
      params={{ mode: "gate_application", availableGates: ["H"] }}
      onChange={vi.fn()}
    />
  );
  expect(screen.getByRole("checkbox", { name: "H" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "X" })).not.toBeChecked();
});

test("checking a gate adds it to availableGates", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <BlochSphereParamsForm
      params={{ mode: "gate_application", availableGates: ["H"] }}
      onChange={onChange}
    />
  );

  await user.click(screen.getByRole("checkbox", { name: "X" }));

  expect(onChange).toHaveBeenCalledWith({
    mode: "gate_application",
    availableGates: ["H", "X"],
  });
});

test("rotation_slider mode shows the slider label input", () => {
  render(<BlochSphereParamsForm params={{ mode: "rotation_slider" }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Slider label")).toBeInTheDocument();
});

test("t1_decay mode shows the T1 input", () => {
  render(<BlochSphereParamsForm params={{ mode: "t1_decay", t1Ms: 500 }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("T1 (ms)")).toHaveValue(500);
});

test("selecting custom amplitudes reveals real/imaginary part inputs", async () => {
  const user = userEvent.setup();
  render(<StatefulForm initialParams={{ mode: "free_placement" }} />);

  await user.selectOptions(screen.getByLabelText("Start state"), "custom");

  expect(screen.getByLabelText("Real part")).toBeInTheDocument();
  expect(screen.getByLabelText("Imaginary part")).toBeInTheDocument();
});

test("a tuple startState renders the custom amplitude inputs with their values", () => {
  render(
    <BlochSphereParamsForm params={{ mode: "free_placement", startState: [0.5, -0.5] }} onChange={vi.fn()} />
  );
  expect(screen.getByLabelText("Real part")).toHaveValue(0.5);
  expect(screen.getByLabelText("Imaginary part")).toHaveValue(-0.5);
});

test("disabled prop disables all controls", () => {
  render(<BlochSphereParamsForm params={{ mode: "free_placement" }} onChange={vi.fn()} disabled />);
  expect(screen.getByLabelText("Mode")).toBeDisabled();
  expect(screen.getByLabelText("Start state")).toBeDisabled();
});
