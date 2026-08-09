import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TermsOfServicePage } from "./TermsOfServicePage.jsx";

test("renders the heading and the pending-review banner", () => {
  render(<TermsOfServicePage />);
  expect(
    screen.getByRole("heading", { level: 1, name: "Terms of Service" })
  ).toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent(
    "has not yet been reviewed by NUST’s legal counsel"
  );
});

test("describes acceptable use and account responsibilities", () => {
  render(<TermsOfServicePage />);
  expect(screen.getByText(/Keep your password confidential/)).toBeInTheDocument();
  expect(
    screen.getByText(/Don.t attempt to bypass access controls/)
  ).toBeInTheDocument();
});
