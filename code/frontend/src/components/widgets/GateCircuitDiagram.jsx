import { useState } from "react";
import "./GateCircuitDiagram.css";

const ROW_HEIGHT = 64;
const COL_WIDTH = 72;
const LABEL_WIDTH = 56;
const GATE_SIZE = 40;
const CNOT_TARGET_RADIUS = 14;
const CNOT_CONTROL_RADIUS = 6;

const GATE_NAMES = {
  H: "Hadamard",
  X: "Pauli-X",
  Y: "Pauli-Y",
  Z: "Pauli-Z",
  M: "Measurement",
};

const GATE_DESCRIPTIONS = {
  H: "Hadamard (H) -- creates an equal superposition from a definite state.",
  X: "Pauli-X (X) -- flips |0⟩ and |1⟩, the quantum equivalent of a classical NOT.",
  Y: "Pauli-Y (Y) -- a combined bit flip and phase flip.",
  Z: "Pauli-Z (Z) -- flips the phase of |1⟩, leaves |0⟩ unchanged.",
  CNOT: "Controlled-NOT (CNOT) -- flips the target qubit only when the control qubit is |1⟩.",
  M: "Measurement -- collapses the qubit to a definite classical outcome.",
};

function qubitY(qubitIndex) {
  return qubitIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function stepX(step) {
  return LABEL_WIDTH + step * COL_WIDTH + COL_WIDTH / 2;
}

// Read/interact-only visualization (Phase 7E.2), same category as TopologyDiagram -- no
// useQuestionAttempt, no submit, no XP, nothing to retry. A circuit diagram has no concept of a
// correct answer to attempt; clicking a gate is a lookup against a small built-in glossary, not a
// graded action, so Milestone 6's before/after-answer-state concepts don't apply here, matching
// TopologyDiagram's own documented non-applicability finding.
//
// params shape (SimulationContentSchema's per-widget-type params -- see screen.validator.js's
// GateCircuitDiagramParamsSchema, which this mirrors exactly):
//   qubitCount: number
//   qubitLabels?: string[]          defaults to "q0", "q1", ... if omitted
//   gates: { type: "H"|"X"|"Y"|"Z"|"CNOT"|"M", step: number, qubits: number[] }[]
//                                   single-qubit gates: qubits = [qubitIndex]
//                                   CNOT: qubits = [controlQubitIndex, targetQubitIndex]
//   caption?: string
//
// Explicit author-supplied step positions, not an automatic moment-scheduling layout engine --
// same "explicit coordinates are the author's job" philosophy as TopologyDiagram's own qubit x/y.
// Gate boxes are real <button> elements absolutely positioned over a plain SVG-backed container,
// mirroring TopologyDiagram's node pattern for the same reason: native buttons get correct
// keyboard/focus/role semantics for free.
export function GateCircuitDiagram({ params }) {
  const { qubitCount, qubitLabels, gates, caption } = params;
  const [selectedIndex, setSelectedIndex] = useState(null);

  const stepCount = gates.length > 0 ? Math.max(...gates.map((gate) => gate.step)) + 1 : 1;
  const width = LABEL_WIDTH + stepCount * COL_WIDTH;
  const height = qubitCount * ROW_HEIGHT;
  const labels = qubitLabels ?? Array.from({ length: qubitCount }, (_, i) => `q${i}`);

  function handleGateClick(index) {
    setSelectedIndex((current) => (current === index ? null : index));
  }

  const selectedGate = selectedIndex !== null ? gates[selectedIndex] : null;

  return (
    <figure className="gate-circuit-diagram">
      {caption && <figcaption className="gate-circuit-diagram__caption">{caption}</figcaption>}

      <div className="gate-circuit-diagram__canvas" style={{ width, height }}>
        <svg
          className="gate-circuit-diagram__lines"
          width={width}
          height={height}
          aria-hidden="true"
        >
          {Array.from({ length: qubitCount }, (_, qubitIndex) => (
            <line
              key={`wire-${qubitIndex}`}
              x1={LABEL_WIDTH}
              y1={qubitY(qubitIndex)}
              x2={width}
              y2={qubitY(qubitIndex)}
              className="gate-circuit-diagram__wire"
            />
          ))}

          {gates.map((gate, index) => {
            if (gate.type !== "CNOT" || gate.qubits.length !== 2) return null;
            const [control, target] = gate.qubits;
            const x = stepX(gate.step);
            const isSelected = index === selectedIndex;
            return (
              <g
                key={`cnot-${index}`}
                className={
                  isSelected
                    ? "gate-circuit-diagram__cnot gate-circuit-diagram__cnot--selected"
                    : "gate-circuit-diagram__cnot"
                }
              >
                <line
                  x1={x}
                  y1={qubitY(control)}
                  x2={x}
                  y2={qubitY(target)}
                  className="gate-circuit-diagram__connector"
                />
                <circle
                  cx={x}
                  cy={qubitY(control)}
                  r={CNOT_CONTROL_RADIUS}
                  className="gate-circuit-diagram__control-dot"
                />
                <circle
                  cx={x}
                  cy={qubitY(target)}
                  r={CNOT_TARGET_RADIUS}
                  className="gate-circuit-diagram__target-ring"
                />
                <line
                  x1={x - CNOT_TARGET_RADIUS}
                  y1={qubitY(target)}
                  x2={x + CNOT_TARGET_RADIUS}
                  y2={qubitY(target)}
                  className="gate-circuit-diagram__target-cross"
                />
                <line
                  x1={x}
                  y1={qubitY(target) - CNOT_TARGET_RADIUS}
                  x2={x}
                  y2={qubitY(target) + CNOT_TARGET_RADIUS}
                  className="gate-circuit-diagram__target-cross"
                />
              </g>
            );
          })}
        </svg>

        {labels.map((label, qubitIndex) => (
          <span
            key={`label-${qubitIndex}`}
            className="gate-circuit-diagram__qubit-label"
            style={{ top: qubitY(qubitIndex) - 10 }}
          >
            {label}
          </span>
        ))}

        {gates.map((gate, index) => {
          const isSelected = index === selectedIndex;
          const buttonClassName = [
            "gate-circuit-diagram__gate-button",
            gate.type === "CNOT" && "gate-circuit-diagram__gate-button--cnot",
            isSelected && "gate-circuit-diagram__gate-button--selected",
          ]
            .filter(Boolean)
            .join(" ");

          if (gate.type === "CNOT" && gate.qubits.length === 2) {
            const [control, target] = gate.qubits;
            const top = Math.min(control, target) * ROW_HEIGHT;
            const bottom = Math.max(control, target) * ROW_HEIGHT + ROW_HEIGHT;
            return (
              <button
                key={index}
                type="button"
                className={buttonClassName}
                style={{
                  left: stepX(gate.step) - GATE_SIZE / 2,
                  top,
                  width: GATE_SIZE,
                  height: bottom - top,
                }}
                onClick={() => handleGateClick(index)}
                aria-pressed={isSelected}
                aria-label={`CNOT gate, control ${labels[control]}, target ${labels[target]}, step ${gate.step + 1}`}
              />
            );
          }

          const qubitIndex = gate.qubits[0];
          return (
            <button
              key={index}
              type="button"
              className={buttonClassName}
              style={{
                left: stepX(gate.step) - GATE_SIZE / 2,
                top: qubitY(qubitIndex) - GATE_SIZE / 2,
                width: GATE_SIZE,
                height: GATE_SIZE,
              }}
              onClick={() => handleGateClick(index)}
              aria-pressed={isSelected}
              aria-label={`${GATE_NAMES[gate.type] ?? gate.type} gate on ${labels[qubitIndex]}, step ${gate.step + 1}`}
            >
              {gate.type}
            </button>
          );
        })}
      </div>

      <p className="gate-circuit-diagram__result" role="status">
        {selectedGate
          ? GATE_DESCRIPTIONS[selectedGate.type]
          : "Click a gate to learn what it does."}
      </p>
    </figure>
  );
}
