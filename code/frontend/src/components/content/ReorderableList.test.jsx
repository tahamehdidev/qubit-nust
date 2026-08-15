import { test, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReorderableList } from "./ReorderableList.jsx";

const ITEMS = [
  { id: 1, title: "First" },
  { id: 2, title: "Second" },
  { id: 3, title: "Third" },
];

function renderList(props = {}) {
  return render(
    <ReorderableList
      items={ITEMS}
      getId={(item) => item.id}
      getLabel={(item) => item.title}
      renderItem={(item) => <span>{item.title}</span>}
      onReorder={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />
  );
}

test("renders items in their given order", () => {
  renderList();
  const items = screen.getAllByRole("listitem").map((li) => li.textContent);
  expect(items[0]).toContain("First");
  expect(items[1]).toContain("Second");
  expect(items[2]).toContain("Third");
});

test("Move up/down buttons are disabled at the boundaries", () => {
  renderList();
  expect(screen.getByRole("button", { name: "Move First up" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move Third down" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move Second up" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Move Second down" })).toBeEnabled();
});

test("clicking Move down calls onReorder with the new full ordered id list", async () => {
  const user = userEvent.setup();
  const onReorder = vi.fn().mockResolvedValue(undefined);
  renderList({ onReorder });

  await user.click(screen.getByRole("button", { name: "Move First down" }));

  expect(onReorder).toHaveBeenCalledWith([2, 1, 3]);
  await waitFor(() => {
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("Second");
    expect(items[1]).toContain("First");
  });
});

test("a rejected onReorder reverts the local order", async () => {
  const user = userEvent.setup();
  const onReorder = vi.fn().mockRejectedValue(new Error("network error"));
  renderList({ onReorder });

  await user.click(screen.getByRole("button", { name: "Move First down" }));

  await waitFor(() => {
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("First");
    expect(items[1]).toContain("Second");
  });
});

test("dragging the first item onto the third position reorders correctly", async () => {
  const onReorder = vi.fn().mockResolvedValue(undefined);
  renderList({ onReorder });

  const [first, , third] = screen.getAllByRole("listitem");
  fireEvent.dragStart(first);
  fireEvent.dragOver(third);
  fireEvent.drop(third);

  await waitFor(() => expect(onReorder).toHaveBeenCalledWith([2, 3, 1]));
});

test("isReordering disables both move buttons and dragging", () => {
  renderList({ isReordering: true });
  expect(screen.getByRole("button", { name: "Move Second up" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move Second down" })).toBeDisabled();
  expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("draggable", "false");
});

// Regression test for a real, live-confirmed bug: a parent re-render after a successful reorder
// commit often recomputes its own sorted array (new reference, identical members/order_index,
// since the parent hadn't -- or in a case like this couldn't yet -- updated its own order_index
// values) and passes that down as a new `items` reference. The effect must not treat that as "the
// item set changed" and reset the just-committed optimistic order back to the stale one.
test("a same-membership items array with a new reference does not reset an in-progress reorder", async () => {
  const onReorder = vi.fn().mockResolvedValue(undefined);
  const { rerender } = renderList({ onReorder });

  await userEvent.setup().click(screen.getByRole("button", { name: "Move First down" }));
  await waitFor(() => {
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("Second");
  });

  // Same three items, same ids, but a brand-new array reference -- e.g. the parent's own
  // `[...course.chapters].sort(...)` recomputing on an unrelated re-render.
  rerender(
    <ReorderableList
      items={[...ITEMS]}
      getId={(item) => item.id}
      getLabel={(item) => item.title}
      renderItem={(item) => <span>{item.title}</span>}
      onReorder={onReorder}
    />
  );

  const items = screen.getAllByRole("listitem").map((li) => li.textContent);
  expect(items[0]).toContain("Second");
  expect(items[1]).toContain("First");
});

test("re-derives order when the items prop changes (e.g. after an add elsewhere)", () => {
  const { rerender } = renderList();
  rerender(
    <ReorderableList
      items={[...ITEMS, { id: 4, title: "Fourth" }]}
      getId={(item) => item.id}
      getLabel={(item) => item.title}
      renderItem={(item) => <span>{item.title}</span>}
      onReorder={vi.fn().mockResolvedValue(undefined)}
    />
  );
  expect(screen.getByText("Fourth")).toBeInTheDocument();
});
