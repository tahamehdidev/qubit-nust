import { test, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DragDrop } from "./DragDrop.jsx";
import { dragDropQuestion, dragDropSubmitScenarios } from "./DragDrop.fixtures.js";

// Most of these exercise the up/down buttons -- the same interaction keyboard and touch users
// rely on, and the one PRODUCT.md requires as a real (not just fallback) alternative. One test
// below also drives the native drag path directly via fireEvent: this widget's handlers only
// track *which position* is being dragged (component state), never dataTransfer, so firing
// dragstart/dragover/drop is a faithful simulation, not a workaround.

test("renders the prompt and every item in its starting order", () => {
  render(<DragDrop question={dragDropQuestion} onSubmit={vi.fn()} />);

  expect(screen.getByText(dragDropQuestion.prompt)).toBeInTheDocument();
  const items = screen.getAllByRole("listitem").map((item) => item.textContent);
  dragDropQuestion.content.items.forEach((label, index) => {
    expect(items[index]).toContain(label);
  });
});

test("the first item's Move Up and the last item's Move Down are disabled", () => {
  render(<DragDrop question={dragDropQuestion} onSubmit={vi.fn()} />);

  const [first, , last] = dragDropQuestion.content.items;
  expect(screen.getByRole("button", { name: `Move "${first}" up` })).toBeDisabled();
  expect(screen.getByRole("button", { name: `Move "${last}" down` })).toBeDisabled();
});

test("shows a hint toggle when the question has one, and the explanation after submission", async () => {
  const user = userEvent.setup();
  const questionWithHelp = {
    ...dragDropQuestion,
    hint: "Fewer qubits generally means more classical bits packed per qubit.",
  };
  const onSubmit = vi.fn(() =>
    Promise.resolve({
      isCorrect: true,
      xpAwarded: true,
      explanation: "Amplitude encoding packs the most classical data per qubit.",
    })
  );
  render(<DragDrop question={questionWithHelp} onSubmit={onSubmit} />);

  await user.click(screen.getByRole("button", { name: "Show hint" }));
  expect(
    screen.getByText("Fewer qubits generally means more classical bits packed per qubit.")
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() =>
    expect(
      screen.getByText("Amplitude encoding packs the most classical data per qubit.")
    ).toBeInTheDocument()
  );
});

test("moving the first item down swaps it with its neighbor and submits the new order", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn(dragDropSubmitScenarios.correctFirstAttempt);
  const [itemA, itemB] = dragDropQuestion.content.items;
  render(<DragDrop question={dragDropQuestion} onSubmit={onSubmit} />);

  await user.click(screen.getByRole("button", { name: `Move "${itemA}" down` }));

  const items = screen.getAllByRole("listitem").map((item) => item.textContent);
  expect(items[0]).toContain(itemB);
  expect(items[1]).toContain(itemA);

  await user.click(screen.getByRole("button", { name: "Submit" }));
  expect(onSubmit).toHaveBeenCalledWith({ order: [1, 0, 2] });
});

test("dragging the first item onto the last position reorders the list", () => {
  render(<DragDrop question={dragDropQuestion} onSubmit={vi.fn()} />);
  const [itemA, itemB, itemC] = dragDropQuestion.content.items;

  const rows = screen.getAllByRole("listitem");
  fireEvent.dragStart(rows[0]);
  fireEvent.dragOver(rows[2]);
  fireEvent.drop(rows[2]);

  const items = screen.getAllByRole("listitem").map((item) => item.textContent);
  expect(items[0]).toContain(itemB);
  expect(items[1]).toContain(itemC);
  expect(items[2]).toContain(itemA);
});

test("shows XP-awarded feedback and disables reordering on a first-time correct answer", async () => {
  const user = userEvent.setup();
  render(
    <DragDrop question={dragDropQuestion} onSubmit={dragDropSubmitScenarios.correctFirstAttempt} />
  );

  await user.click(screen.getByRole("button", { name: "Submit" }));

  await waitFor(() => expect(screen.getByText(/^Correct!/)).toBeInTheDocument());
  expect(screen.getByText(/XP awarded/)).toBeInTheDocument();
  const [first] = dragDropQuestion.content.items;
  expect(screen.getByRole("button", { name: `Move "${first}" down` })).toBeDisabled();
});

test("shows the already-had-credit message when correct but xpAwarded is false", async () => {
  const user = userEvent.setup();
  render(
    <DragDrop
      question={dragDropQuestion}
      onSubmit={dragDropSubmitScenarios.correctAlreadyEarnedXp}
    />
  );

  await user.click(screen.getByRole("button", { name: "Submit" }));

  await waitFor(() =>
    expect(screen.getByText(/already earned XP for this question/)).toBeInTheDocument()
  );
});

test("shows incorrect feedback and a Try Again button that restores the starting order", async () => {
  const user = userEvent.setup();
  const [itemA] = dragDropQuestion.content.items;
  render(<DragDrop question={dragDropQuestion} onSubmit={dragDropSubmitScenarios.incorrect} />);

  await user.click(screen.getByRole("button", { name: `Move "${itemA}" down` }));
  await user.click(screen.getByRole("button", { name: "Submit" }));

  await waitFor(() => expect(screen.getByText("Not quite — try again.")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Try Again" }));

  const items = screen.getAllByRole("listitem").map((item) => item.textContent);
  expect(items[0]).toContain(itemA);
});

test("shows a verdict on the list itself, not just the shared text feedback below it", async () => {
  const user = userEvent.setup();
  const { container: correctContainer } = render(
    <DragDrop question={dragDropQuestion} onSubmit={dragDropSubmitScenarios.correctFirstAttempt} />
  );
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() =>
    expect(correctContainer.querySelector(".drag-drop__list-wrapper--correct")).toBeInTheDocument()
  );
  expect(within(correctContainer).getByText("Correct order")).toBeInTheDocument();

  const { container: incorrectContainer } = render(
    <DragDrop question={dragDropQuestion} onSubmit={dragDropSubmitScenarios.incorrect} />
  );
  await user.click(within(incorrectContainer).getByRole("button", { name: "Submit" }));
  await waitFor(() =>
    expect(
      incorrectContainer.querySelector(".drag-drop__list-wrapper--incorrect")
    ).toBeInTheDocument()
  );
  expect(within(incorrectContainer).getByText("Not the correct order")).toBeInTheDocument();
});

test("See answer reveals the correct order only after being clicked, and resets on retry", async () => {
  const user = userEvent.setup();
  const [itemA, itemB, itemC] = dragDropQuestion.content.items;
  render(<DragDrop question={dragDropQuestion} onSubmit={dragDropSubmitScenarios.incorrect} />);

  await user.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() => expect(screen.getByText("Not quite — try again.")).toBeInTheDocument());

  expect(screen.queryByText("Correct order:")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "See answer" }));
  const revealedItems = screen
    .getByText("Correct order:")
    .closest(".drag-drop__reveal")
    .querySelectorAll("li");
  expect([...revealedItems].map((item) => item.textContent)).toEqual([itemB, itemC, itemA]);

  await user.click(screen.getByRole("button", { name: "Try Again" }));
  expect(screen.queryByText("Correct order:")).not.toBeInTheDocument();
});

test("shows a submission-error message with a retry that preserves the current order", async () => {
  const user = userEvent.setup();
  const [itemA, itemB] = dragDropQuestion.content.items;
  render(<DragDrop question={dragDropQuestion} onSubmit={dragDropSubmitScenarios.networkError} />);

  await user.click(screen.getByRole("button", { name: `Move "${itemA}" down` }));
  await user.click(screen.getByRole("button", { name: "Submit" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Could not submit your answer")
  );

  await user.click(screen.getByRole("button", { name: "Retry Submission" }));

  const items = screen.getAllByRole("listitem").map((item) => item.textContent);
  expect(items[0]).toContain(itemB);
  expect(items[1]).toContain(itemA);
});
