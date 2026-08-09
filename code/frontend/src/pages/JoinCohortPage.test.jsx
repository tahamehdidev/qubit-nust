import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { cohortService } from "../services/cohort.service.js";
import { JoinCohortPage } from "./JoinCohortPage.jsx";

vi.mock("../services/cohort.service.js", () => ({
  cohortService: { join: vi.fn() },
}));

function renderPage(joinCode = "ABC123DE") {
  return render(
    <MemoryRouter initialEntries={[`/join/${joinCode}`]}>
      <Routes>
        <Route path="/join/:joinCode" element={<JoinCohortPage />} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
        <Route path="/courses" element={<div>Course catalog</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("attempts to join automatically on mount, using the joinCode from the URL", async () => {
  cohortService.join.mockResolvedValue({
    enrollment: { id: 1 },
    cohort: { id: 5, name: "Fall Cohort" },
  });
  renderPage("ABC123DE");

  expect(await screen.findByText("You're in")).toBeInTheDocument();
  expect(cohortService.join).toHaveBeenCalledWith("ABC123DE");
  expect(screen.getByText("You've joined Fall Cohort.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go to your dashboard" })).toHaveAttribute(
    "href",
    "/dashboard"
  );
});

test("treats an already-active enrollment as a success, not an error", async () => {
  cohortService.join.mockRejectedValue({
    response: {
      data: {
        error: {
          code: "DUPLICATE_RESOURCE",
          message: "This student already has an active enrollment in this cohort.",
        },
      },
    },
  });
  renderPage();

  expect(await screen.findByText("Already joined")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go to your dashboard" })).toBeInTheDocument();
});

test("shows an error and a way back out for an invalid join code", async () => {
  cohortService.join.mockRejectedValue({
    response: { data: { error: { code: "NOT_FOUND", message: "Invalid join code." } } },
  });
  renderPage();

  expect(await screen.findByText("Couldn’t join this cohort")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Invalid join code.");
  expect(screen.getByRole("link", { name: "Browse courses instead" })).toHaveAttribute(
    "href",
    "/courses"
  );
});
