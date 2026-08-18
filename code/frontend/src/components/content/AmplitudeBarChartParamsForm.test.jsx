import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AmplitudeBarChartParamsForm } from "./AmplitudeBarChartParamsForm.jsx";

test("renders one row per amplitude, pairing labels positionally", () => {
  render(
    <AmplitudeBarChartParamsForm
      params={{ amplitudes: [0.5, -0.5], labels: ["00", "01"] }}
      onChange={vi.fn()}
    />
  );
  const labelInputs = screen.getAllByLabelText("Label");
  const amplitudeInputs = screen.getAllByLabelText("Amplitude");
  expect(labelInputs[0]).toHaveValue("00");
  expect(labelInputs[1]).toHaveValue("01");
  expect(amplitudeInputs[0]).toHaveValue(0.5);
  expect(amplitudeInputs[1]).toHaveValue(-0.5);
});

test("shows no basis states message when amplitudes is empty", () => {
  render(<AmplitudeBarChartParamsForm params={{}} onChange={vi.fn()} />);
  expect(screen.getByText("No basis states yet.")).toBeInTheDocument();
});

test("adding a basis state appends a zero-amplitude row to both arrays", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <AmplitudeBarChartParamsForm
      params={{ amplitudes: [0.5], labels: ["0"] }}
      onChange={onChange}
    />
  );

  await user.click(screen.getByRole("button", { name: "Add basis state" }));

  expect(onChange).toHaveBeenCalledWith({ amplitudes: [0.5, 0], labels: ["0", ""] });
});

test("editing an amplitude keeps both arrays in sync", () => {
  const onChange = vi.fn();
  render(
    <AmplitudeBarChartParamsForm
      params={{ amplitudes: [0.5], labels: ["0"] }}
      onChange={onChange}
    />
  );

  fireEvent.change(screen.getByLabelText("Amplitude"), { target: { value: "0.9" } });

  expect(onChange).toHaveBeenCalledWith({ amplitudes: [0.9], labels: ["0"] });
});

test("removing a row drops it from both arrays", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <AmplitudeBarChartParamsForm
      params={{ amplitudes: [0.5, -0.5], labels: ["00", "01"] }}
      onChange={onChange}
    />
  );

  await user.click(screen.getByRole("button", { name: "Remove row 1" }));

  expect(onChange).toHaveBeenCalledWith({ amplitudes: [-0.5], labels: ["01"] });
});

test("the highlighted-state select lists each row by label and updates highlightedIndex", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <AmplitudeBarChartParamsForm
      params={{ amplitudes: [0.5, -0.5], labels: ["00", "01"] }}
      onChange={onChange}
    />
  );

  await user.selectOptions(screen.getByLabelText("Highlighted state (optional)"), "1");

  expect(onChange).toHaveBeenCalledWith({
    amplitudes: [0.5, -0.5],
    labels: ["00", "01"],
    highlightedIndex: 1,
  });
});
