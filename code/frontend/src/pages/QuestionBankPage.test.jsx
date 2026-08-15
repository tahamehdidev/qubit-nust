import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { questionService } from "../services/question.service.js";
import { QuestionBankPage } from "./QuestionBankPage.jsx";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../services/question.service.js", () => ({
  questionService: { list: vi.fn() },
}));

const QUESTIONS = [
  { id: 1, prompt: "What is 2+2?", type: "mcq", createdById: "i1" },
  { id: 2, prompt: "Order these", type: "drag_drop", createdById: "i2" },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/content/questions"]}>
      <Routes>
        <Route path="/admin/content/questions" element={<QuestionBankPage />} />
        <Route path="/admin/content/questions/:questionId" element={<div>Question edit page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: "i1", role: "instructor" } });
  questionService.list.mockResolvedValue({
    questions: QUESTIONS,
    pagination: { page: 1, limit: 20, total: 2 },
  });
});

test("renders questions with type badge and an owner tag for the caller's own", async () => {
  renderPage();

  expect(await screen.findByText("What is 2+2?")).toBeInTheDocument();
  expect(screen.getByText("mcq")).toBeInTheDocument();
  expect(screen.getByText("Order these")).toBeInTheDocument();
  expect(screen.getByText("Yours")).toBeInTheDocument();
});

test("clicking a question navigates to its edit page", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByText("What is 2+2?"));

  expect(await screen.findByText("Question edit page")).toBeInTheDocument();
});

test("the new-question link points at the create route", async () => {
  renderPage();
  await screen.findByText("What is 2+2?");
  expect(screen.getByRole("link", { name: /New question/ })).toHaveAttribute(
    "href",
    "/admin/content/questions/new"
  );
});

test("changing the type filter re-queries with that type", async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText("What is 2+2?");

  await user.selectOptions(screen.getByLabelText("Type"), "mcq");

  expect(questionService.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: "mcq", page: 1 })
  );
});

test("typing a search term debounces before re-querying", async () => {
  vi.useFakeTimers();
  renderPage();
  await vi.waitFor(() => expect(questionService.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "grover" } });
  vi.advanceTimersByTime(299);
  expect(questionService.list).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(1);
  await vi.waitFor(() => expect(questionService.list).toHaveBeenCalledTimes(2));
  vi.useRealTimers();
});

test("shows a no-results message for an empty result set", async () => {
  questionService.list.mockResolvedValue({ questions: [], pagination: { page: 1, limit: 20, total: 0 } });
  renderPage();

  expect(await screen.findByText("No questions found.")).toBeInTheDocument();
});

test("shows an error banner with a retry button when loading fails", async () => {
  const user = userEvent.setup();
  questionService.list.mockRejectedValueOnce({
    response: { data: { error: { code: "INTERNAL", message: "Load failed." } } },
  });
  renderPage();

  expect(await screen.findByRole("alert")).toHaveTextContent("Load failed.");

  questionService.list.mockResolvedValueOnce({
    questions: QUESTIONS,
    pagination: { page: 1, limit: 20, total: 2 },
  });
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("What is 2+2?")).toBeInTheDocument();
});
