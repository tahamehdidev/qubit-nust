import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card.jsx";

test("renders its children", () => {
  render(<Card>Card content</Card>);
  expect(screen.getByText("Card content")).toBeInTheDocument();
});

test("merges a passed className with the base class", () => {
  render(<Card className="extra">Content</Card>);
  const el = screen.getByText("Content");
  expect(el.className).toContain("card");
  expect(el.className).toContain("extra");
});

test("renders a <div> by default", () => {
  const { container } = render(<Card>Content</Card>);
  expect(container.querySelector("div.card")).toBeInTheDocument();
});

test("the `as` prop renders a different element (e.g. a real <section> landmark)", () => {
  const { container } = render(<Card as="section">Content</Card>);
  expect(container.querySelector("section.card")).toBeInTheDocument();
  expect(container.querySelector("div.card")).not.toBeInTheDocument();
});

test("does not get the interactive hover class by default", () => {
  render(<Card>Content</Card>);
  expect(screen.getByText("Content").className).not.toContain("card--interactive");
});

test("the `interactive` prop adds the hover-lift class", () => {
  render(<Card interactive>Content</Card>);
  expect(screen.getByText("Content").className).toContain("card--interactive");
});
