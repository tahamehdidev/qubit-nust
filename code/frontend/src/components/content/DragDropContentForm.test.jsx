import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DragDropContentForm } from "./DragDropContentForm.jsx";

const CONTENT = { items: ["Basis", "Amplitude", "Angle"], correctOrder: [1, 2, 0] };

test("renders one item input per item, in display order", () => {
  render(<DragDropContentForm content={CONTENT} onChange={vi.fn()} />);
  const itemInputs = screen.getAllByLabelText(/Item \d/);
  expect(itemInputs.map((input) => input.value)).toEqual(["Basis", "Amplitude", "Angle"]);
});

test("renders the correct-order list arranged per correctOrder, not display order", () => {
  render(<DragDropContentForm content={CONTENT} onChange={vi.fn()} />);
  const rows = screen.getAllByRole("listitem");
  expect(rows.map((row) => row.textContent)).toEqual(["Amplitude", "Angle", "Basis"]);
});

test("editing an item's text updates it without resetting correctOrder", () => {
  const onChange = vi.fn();
  render(<DragDropContentForm content={CONTENT} onChange={onChange} />);

  fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "Basis Encoding" } });

  expect(onChange).toHaveBeenCalledWith({
    items: ["Basis Encoding", "Amplitude", "Angle"],
    correctOrder: [1, 2, 0],
  });
});

test("adding an item resets correctOrder to identity", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<DragDropContentForm content={CONTENT} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Add item" }));

  expect(onChange).toHaveBeenCalledWith({
    items: ["Basis", "Amplitude", "Angle", ""],
    correctOrder: [0, 1, 2, 3],
  });
});

test("removing an item resets correctOrder to identity", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<DragDropContentForm content={CONTENT} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "Remove row 1" }));

  expect(onChange).toHaveBeenCalledWith({
    items: ["Amplitude", "Angle"],
    correctOrder: [0, 1],
  });
});

test("moving a correct-order row calls onChange with the new permutation of item indices", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <DragDropContentForm
      content={{ items: ["A", "B", "C"], correctOrder: [0, 1, 2] }}
      onChange={onChange}
    />
  );

  await user.click(screen.getByRole("button", { name: "Move A down" }));

  expect(onChange).toHaveBeenCalledWith({ items: ["A", "B", "C"], correctOrder: [1, 0, 2] });
});
