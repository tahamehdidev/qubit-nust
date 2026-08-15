import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { questionService } from "../../services/question.service.js";
import { QuestionPicker } from "./QuestionPicker.jsx";

vi.mock("../../services/question.service.js", () => ({
  questionService: { list: vi.fn() },
}));

const QUESTIONS = [
  { id: 1, prompt: "What is 2+2?", type: "mcq" },
  { id: 2, prompt: "Order these", type: "drag_drop" },
];

function renderPicker(props = {}) {
  return render(
    <MemoryRouter>
      <QuestionPicker onPick={vi.fn()} {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  questionService.list.mockResolvedValue({
    questions: QUESTIONS,
    pagination: { page: 1, limit: 10, total: 2 },
  });
});

test("loads and renders results with a type badge and truncated prompt", async () => {
  renderPicker();

  expect(await screen.findByText("What is 2+2?")).toBeInTheDocument();
  expect(screen.getByText("mcq")).toBeInTheDocument();
  expect(screen.getByText("Order these")).toBeInTheDocument();
});

test("shows a no-results message for an empty result set", async () => {
  questionService.list.mockResolvedValue({ questions: [], pagination: { page: 1, limit: 10, total: 0 } });
  renderPicker();

  expect(await screen.findByText("No questions found.")).toBeInTheDocument();
});

test("clicking Use this question calls onPick with that question", async () => {
  const user = userEvent.setup();
  const onPick = vi.fn();
  renderPicker({ onPick });

  await screen.findByText("What is 2+2?");
  const buttons = screen.getAllByRole("button", { name: "Use this question" });
  await user.click(buttons[0]);

  expect(onPick).toHaveBeenCalledWith(QUESTIONS[0]);
});

test("typing in search debounces before calling questionService.list again", async () => {
  vi.useFakeTimers();
  renderPicker();
  await vi.waitFor(() => expect(questionService.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "grover" } });
  vi.advanceTimersByTime(299);
  expect(questionService.list).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(1);
  await vi.waitFor(() => expect(questionService.list).toHaveBeenCalledTimes(2));
  expect(questionService.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ search: "grover", page: 1 })
  );
  vi.useRealTimers();
});

test("includes a create-new-question link out to the question editor", async () => {
  renderPicker();
  await screen.findByText("What is 2+2?");
  expect(screen.getByRole("link", { name: "Create new question instead" })).toHaveAttribute(
    "href",
    "/admin/content/questions/new"
  );
});

test("shows an error banner when the search fails", async () => {
  questionService.list.mockRejectedValue({
    response: { data: { error: { code: "INTERNAL", message: "Search failed." } } },
  });
  renderPicker();

  expect(await screen.findByRole("alert")).toHaveTextContent("Search failed.");
});
