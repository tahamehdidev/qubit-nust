import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RepeatableFieldList } from "./RepeatableFieldList.jsx";

function renderList(props = {}) {
  return render(
    <RepeatableFieldList
      items={[{ value: "a" }, { value: "b" }]}
      onChange={vi.fn()}
      onAdd={() => ({ value: "" })}
      addLabel="Add row"
      renderRow={(item, index, updateRow) => (
        <input
          aria-label={`value ${index}`}
          value={item.value}
          onChange={(event) => updateRow({ value: event.target.value })}
        />
      )}
      {...props}
    />
  );
}

test("renders one row per item via renderRow", () => {
  renderList();
  expect(screen.getByLabelText("value 0")).toHaveValue("a");
  expect(screen.getByLabelText("value 1")).toHaveValue("b");
});

test("shows emptyText when items is empty", () => {
  renderList({ items: [], emptyText: "Nothing here." });
  expect(screen.getByText("Nothing here.")).toBeInTheDocument();
});

test("clicking add calls onChange with the new row appended", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  renderList({ onChange });

  await user.click(screen.getByRole("button", { name: "Add row" }));

  expect(onChange).toHaveBeenCalledWith([{ value: "a" }, { value: "b" }, { value: "" }]);
});

test("clicking remove on a row calls onChange with that row filtered out and the removed index", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  renderList({ onChange });

  await user.click(screen.getByRole("button", { name: "Remove row 1" }));

  expect(onChange).toHaveBeenCalledWith([{ value: "b" }], { removedIndex: 0 });
});

test("editing a row's field calls onChange with that row replaced", () => {
  const onChange = vi.fn();
  renderList({ onChange });

  fireEvent.change(screen.getByLabelText("value 0"), { target: { value: "z" } });

  expect(onChange).toHaveBeenCalledWith([{ value: "z" }, { value: "b" }]);
});

test("disabled disables add and remove buttons", () => {
  renderList({ disabled: true });
  expect(screen.getByRole("button", { name: "Add row" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove row 1" })).toBeDisabled();
});
