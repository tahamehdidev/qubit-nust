import { test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LandingHeroVisual } from "./LandingHeroVisual.jsx";

// A controlled, presentational component now (Milestone: the P(|0>)/P(|1>) readout moved to the
// hero copy column in LandingPage.jsx, which also now owns theta/phi/drag state) -- these tests
// only cover rendering and prop passthrough. The interaction behavior itself (drag updates
// angles, ambient animation resumes after release, readout reveal-on-interact) is covered in
// LandingPage.test.jsx, the new state owner.
vi.mock("../components/widgets/BlochSphereScene.jsx", () => ({
  BlochSphereScene: ({ theta, phi, draggable, onDrag, onDragEnd }) => (
    <div
      data-testid="hero-scene"
      data-draggable={draggable}
      data-theta={theta}
      data-phi={phi}
      onMouseDown={() => onDrag({ theta: 1, phi: 2 })}
      onClick={() => {
        onDrag({ theta: 1, phi: 2 });
        onDragEnd();
      }}
    />
  ),
}));

test("renders the live 3D scene, draggable, and passes theta/phi through when webglAvailable is true", () => {
  render(
    <LandingHeroVisual
      webglAvailable
      theta={0.5}
      phi={1.2}
      onDrag={() => {}}
      onDragEnd={() => {}}
    />
  );

  const scene = screen.getByTestId("hero-scene");
  expect(scene).toBeInTheDocument();
  expect(scene).toHaveAttribute("data-draggable", "true");
  expect(scene).toHaveAttribute("data-theta", "0.5");
  expect(scene).toHaveAttribute("data-phi", "1.2");
});

test("renders the pole labels", () => {
  render(
    <LandingHeroVisual
      webglAvailable
      theta={0.5}
      phi={1.2}
      onDrag={() => {}}
      onDragEnd={() => {}}
    />
  );

  expect(screen.getByText("|0⟩")).toBeInTheDocument();
  expect(screen.getByText("|1⟩")).toBeInTheDocument();
});

test("calls onDrag and onDragEnd when the scene reports a drag", () => {
  const onDrag = vi.fn();
  const onDragEnd = vi.fn();
  render(
    <LandingHeroVisual webglAvailable theta={0.5} phi={1.2} onDrag={onDrag} onDragEnd={onDragEnd} />
  );

  fireEvent.click(screen.getByTestId("hero-scene"));

  expect(onDrag).toHaveBeenCalledWith({ theta: 1, phi: 2 });
  expect(onDragEnd).toHaveBeenCalled();
});

test("the scene is a focusable, labelled control that forwards key presses (critique fix: was aria-hidden and mouse/touch-only)", () => {
  const onKeyDown = vi.fn();
  render(
    <LandingHeroVisual
      webglAvailable
      theta={0.5}
      phi={1.2}
      onDrag={() => {}}
      onDragEnd={() => {}}
      onKeyDown={onKeyDown}
    />
  );

  const group = screen.getByRole("group", { name: /rotate it/ });
  expect(group).toHaveAttribute("tabIndex", "0");

  fireEvent.keyDown(group, { key: "ArrowRight" });
  expect(onKeyDown).toHaveBeenCalledTimes(1);
});

test("falls back to the static SVG illustration when webglAvailable is false, without touching the scene", () => {
  const { container } = render(
    <LandingHeroVisual
      webglAvailable={false}
      theta={0.5}
      phi={1.2}
      onDrag={() => {}}
      onDragEnd={() => {}}
    />
  );

  expect(screen.queryByTestId("hero-scene")).not.toBeInTheDocument();
  expect(container.querySelector("svg.landing-hero-visual__fallback")).toBeInTheDocument();
});
