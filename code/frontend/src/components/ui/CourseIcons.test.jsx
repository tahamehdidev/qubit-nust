import { test, expect } from "vitest";
import { render } from "@testing-library/react";
import { NeuralNetIcon, AlgorithmIcon, QubitChipIcon, getCourseIcon } from "./CourseIcons.jsx";

test("getCourseIcon returns the matching icon for each real seeded course title", () => {
  expect(getCourseIcon("Quantum Machine Learning")).toBe(NeuralNetIcon);
  expect(getCourseIcon("Quantum Algorithms")).toBe(AlgorithmIcon);
  expect(getCourseIcon("Quantum Computing Hardware")).toBe(QubitChipIcon);
});

test("getCourseIcon falls back to a default icon for an unrecognized title, rather than returning nothing", () => {
  expect(getCourseIcon("Some Future Course")).toBe(QubitChipIcon);
});

test("each icon renders an aria-hidden svg (decorative, not the accessible name source)", () => {
  for (const Icon of [NeuralNetIcon, AlgorithmIcon, QubitChipIcon]) {
    const { container } = render(<Icon className="test-icon" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("test-icon");
  }
});
