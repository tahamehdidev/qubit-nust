import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage.jsx";

test("renders the heading and the pending-review banner", () => {
  render(<PrivacyPolicyPage />);
  expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent(
    "has not yet been reviewed by NUST’s legal counsel"
  );
});

test("describes who can see a learner's data", () => {
  render(<PrivacyPolicyPage />);
  expect(screen.getByText(/Your instructor/)).toBeInTheDocument();
  expect(screen.getByText(/Administrators/)).toBeInTheDocument();
});
