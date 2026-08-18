import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { cohortService } from "../services/cohort.service.js";
import { CohortsPage } from "./CohortsPage.jsx";

vi.mock("../services/cohort.service.js", () => ({
  cohortService: { list: vi.fn(), create: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/cohorts"]}>
      <Routes>
        <Route path="/cohorts" element={<CohortsPage />} />
        <Route path="/cohorts/:cohortId" element={<div>Cohort detail page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("renders the instructor's cohorts as cards linking to their detail pages", async () => {
  cohortService.list.mockResolvedValue({
    cohorts: [
      { id: 5, name: "Fall Cohort", join_code: "ABC123DE" },
      { id: 6, name: "Spring Cohort", join_code: "XYZ789FG" },
    ],
  });
  renderPage();

  expect(await screen.findByText("Fall Cohort")).toBeInTheDocument();
  expect(screen.getByText("ABC123DE")).toBeInTheDocument();
  expect(screen.getByText("Spring Cohort").closest("a")).toHaveAttribute("href", "/cohorts/6");
});

test("shows an empty state pointing at the create form when there are no cohorts", async () => {
  cohortService.list.mockResolvedValue({ cohorts: [] });
  renderPage();

  expect(await screen.findByText(/No cohorts yet/)).toBeInTheDocument();
});

test("creating a cohort navigates straight to its detail page", async () => {
  const user = userEvent.setup();
  cohortService.list.mockResolvedValue({ cohorts: [] });
  cohortService.create.mockResolvedValue({ id: 9, name: "New Cohort", join_code: "NEW12345" });
  renderPage();

  await screen.findByText(/No cohorts yet/);
  await user.type(screen.getByLabelText("Cohort name"), "New Cohort");
  await user.click(screen.getByRole("button", { name: "Create cohort" }));

  expect(cohortService.create).toHaveBeenCalledWith({
    name: "New Cohort",
    instructorId: undefined,
  });
  expect(await screen.findByText("Cohort detail page")).toBeInTheDocument();
});

test("a failed create shows an error banner without navigating away", async () => {
  const user = userEvent.setup();
  cohortService.list.mockResolvedValue({ cohorts: [] });
  cohortService.create.mockRejectedValue({
    response: { data: { error: { code: "VALIDATION_ERROR", message: "Name is required." } } },
  });
  renderPage();

  await screen.findByText(/No cohorts yet/);
  await user.type(screen.getByLabelText("Cohort name"), "X");
  await user.click(screen.getByRole("button", { name: "Create cohort" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Name is required.");
  expect(screen.queryByText("Cohort detail page")).not.toBeInTheDocument();
});

test("a failed list shows an error banner with a retry that re-fetches", async () => {
  const user = userEvent.setup();
  cohortService.list.mockRejectedValueOnce({
    response: { data: { error: { code: "FORBIDDEN", message: "Not allowed." } } },
  });
  renderPage();

  expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed.");

  cohortService.list.mockResolvedValueOnce({ cohorts: [] });
  await user.click(screen.getByRole("button", { name: "Try again" }));

  await waitFor(() => expect(cohortService.list).toHaveBeenCalledTimes(2));
});
