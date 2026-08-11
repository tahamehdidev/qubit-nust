import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { cohortService } from "../services/cohort.service.js";
import { AdminCohortsPage } from "./AdminCohortsPage.jsx";

vi.mock("../services/cohort.service.js", () => ({
  cohortService: { listAll: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test("renders every cohort with its owning instructor's name and email", async () => {
  cohortService.listAll.mockResolvedValue({
    cohorts: [
      {
        id: 5,
        name: "Fall Cohort",
        join_code: "ABC123DE",
        instructor_name: "Ada Lovelace",
        instructor_email: "ada@example.com",
      },
      {
        id: 6,
        name: "Spring Cohort",
        join_code: "XYZ789FG",
        instructor_name: "Grace Hopper",
        instructor_email: "grace@example.com",
      },
    ],
  });
  render(<AdminCohortsPage />);

  expect(await screen.findByText("Fall Cohort")).toBeInTheDocument();
  expect(screen.getByText("Ada Lovelace · ada@example.com")).toBeInTheDocument();
  expect(screen.getByText("ABC123DE")).toBeInTheDocument();
  expect(screen.getByText("Spring Cohort")).toBeInTheDocument();
});

test("shows an empty state when there are no cohorts platform-wide", async () => {
  cohortService.listAll.mockResolvedValue({ cohorts: [] });
  render(<AdminCohortsPage />);

  expect(await screen.findByText("No cohorts exist yet.")).toBeInTheDocument();
});

test("a failed fetch shows an error banner with a retry that re-fetches", async () => {
  const user = userEvent.setup();
  cohortService.listAll.mockRejectedValueOnce({
    response: { data: { error: { code: "FORBIDDEN", message: "Not allowed." } } },
  });
  render(<AdminCohortsPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed.");

  cohortService.listAll.mockResolvedValueOnce({ cohorts: [] });
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByText("No cohorts exist yet.")).toBeInTheDocument();
});
