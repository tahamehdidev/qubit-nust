import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthShowcase } from "./AuthShowcase.jsx";

test("renders the wordmark and the same pitch the landing page makes", () => {
  render(<AuthShowcase />);
  expect(screen.getByText("Qubit")).toBeInTheDocument();
  expect(screen.getByText("— NUST")).toBeInTheDocument();
  expect(screen.getByText("See the qubit before you compute with it.")).toBeInTheDocument();
});

test("is decorative -- hidden from the accessibility tree, doesn't compete with the actual form", () => {
  const { container } = render(<AuthShowcase />);
  expect(container.querySelector(".auth-showcase")).toHaveAttribute("aria-hidden", "true");
});
