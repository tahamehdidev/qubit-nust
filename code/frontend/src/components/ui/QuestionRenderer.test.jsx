import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuestionRenderer } from "./QuestionRenderer.jsx";
import { mcqQuestion } from "../widgets/Mcq.fixtures.js";
import { numericQuestion } from "../widgets/Numeric.fixtures.js";
import { dragDropQuestion } from "../widgets/DragDrop.fixtures.js";
import { groverDiffusionParams } from "../widgets/AmplitudeBarChart.fixtures.js";
import { gridTopologyParams } from "../widgets/TopologyDiagram.fixtures.js";
import { freePlacementParams } from "../widgets/BlochSphere.fixtures.js";
import { dataProcessingQuadrantParams } from "../widgets/QuadrantSelector.fixtures.js";
import { basisEncoderParams } from "../widgets/BasisEncoder.fixtures.js";
import { bellStateCircuitParams } from "../widgets/GateCircuitDiagram.fixtures.js";

// BlochSphere's actual WebGL rendering lives in its own module specifically so it can be mocked
// like this (see BlochSphere.test.jsx for the jsdom ResizeObserver/WebGL gap this works around).
vi.mock("../widgets/BlochSphereScene.jsx", () => ({
  BlochSphereScene: () => <div data-testid="bloch-sphere-scene" />,
}));

test('dispatches type "quadrant_selector" to the real QuadrantSelector widget', () => {
  render(<QuestionRenderer type="quadrant_selector" params={dataProcessingQuadrantParams} />);
  expect(screen.getByText(dataProcessingQuadrantParams.caption)).toBeInTheDocument();
});

test('dispatches type "basis_encoder" to the real BasisEncoder widget', () => {
  render(<QuestionRenderer type="basis_encoder" params={basisEncoderParams} />);
  expect(screen.getByText(basisEncoderParams.caption)).toBeInTheDocument();
});

test('dispatches type "mcq" to the real Mcq widget', () => {
  render(<QuestionRenderer type="mcq" question={mcqQuestion} onSubmit={vi.fn()} />);
  expect(screen.getByText(mcqQuestion.prompt)).toBeInTheDocument();
});

test('dispatches type "numeric" to the real Numeric widget', () => {
  render(<QuestionRenderer type="numeric" question={numericQuestion} onSubmit={vi.fn()} />);
  expect(screen.getByText(numericQuestion.prompt)).toBeInTheDocument();
});

test('dispatches type "drag_drop" to the real DragDrop widget', () => {
  render(<QuestionRenderer type="drag_drop" question={dragDropQuestion} onSubmit={vi.fn()} />);
  expect(screen.getByText(dragDropQuestion.prompt)).toBeInTheDocument();
});

test('dispatches type "amplitude_bar_chart" to the real AmplitudeBarChart widget', () => {
  render(<QuestionRenderer type="amplitude_bar_chart" params={groverDiffusionParams} />);
  expect(screen.getByText(groverDiffusionParams.caption)).toBeInTheDocument();
});

test('dispatches type "topology_diagram" to the real TopologyDiagram widget', () => {
  render(<QuestionRenderer type="topology_diagram" params={gridTopologyParams} />);
  expect(screen.getByText(gridTopologyParams.caption)).toBeInTheDocument();
});

test('dispatches type "bloch_sphere" to the real BlochSphere widget', () => {
  render(<QuestionRenderer type="bloch_sphere" params={freePlacementParams} />);
  expect(screen.getByTestId("bloch-sphere-scene")).toBeInTheDocument();
});

test('dispatches type "gate_circuit_diagram" to the real GateCircuitDiagram widget', () => {
  render(<QuestionRenderer type="gate_circuit_diagram" params={bellStateCircuitParams} />);
  expect(screen.getByText(bellStateCircuitParams.caption)).toBeInTheDocument();
});

test("renders the placeholder for an unrecognized type too, rather than throwing", () => {
  render(<QuestionRenderer type="not_a_real_widget" />);
  expect(screen.getByText('Widget "not_a_real_widget" not yet implemented.')).toBeInTheDocument();
});
