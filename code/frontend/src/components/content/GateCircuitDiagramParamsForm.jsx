import { Plus, X } from "lucide-react";
import { Input } from "../ui/Input.jsx";
import { Button } from "../ui/Button.jsx";
import "./GateCircuitDiagramParamsForm.css";

// Phase 9 (Milestone 4). Field shapes come directly from screen.validator.js's
// GateCircuitDiagramParamsSchema -- the second (and last, for this milestone) widget type the
// backend actually validates per-field.
const GATE_TYPE_OPTIONS = ["H", "X", "Y", "Z", "CNOT", "M"];

export function GateCircuitDiagramParamsForm({ params, onChange, disabled = false }) {
  const qubitCount = params.qubitCount ?? 1;
  const qubitLabels = params.qubitLabels ?? [];
  const gates = params.gates ?? [];
  const caption = params.caption ?? "";

  function updateParams(patch) {
    onChange({ ...params, ...patch });
  }

  function handleQubitLabelChange(index, value) {
    const next = [...qubitLabels];
    next[index] = value;
    updateParams({ qubitLabels: next });
  }

  function addGate() {
    updateParams({ gates: [...gates, { type: "H", step: 0, qubits: [0] }] });
  }

  function updateGate(index, patch) {
    updateParams({ gates: gates.map((gate, i) => (i === index ? { ...gate, ...patch } : gate)) });
  }

  function removeGate(index) {
    updateParams({ gates: gates.filter((_, i) => i !== index) });
  }

  return (
    <div className="gate-circuit-params-form">
      <Input
        label="Qubit count"
        type="number"
        min={1}
        value={qubitCount}
        onChange={(event) => updateParams({ qubitCount: Number(event.target.value) })}
        disabled={disabled}
      />
      <Input
        label="Caption (optional)"
        value={caption}
        onChange={(event) => updateParams({ caption: event.target.value })}
        disabled={disabled}
      />

      <fieldset className="gate-circuit-params-form__fieldset">
        <legend>Qubit labels (optional)</legend>
        {Array.from({ length: qubitCount }, (_, index) => (
          <Input
            key={index}
            label={`Qubit ${index}`}
            value={qubitLabels[index] ?? ""}
            onChange={(event) => handleQubitLabelChange(index, event.target.value)}
            disabled={disabled}
          />
        ))}
      </fieldset>

      <fieldset className="gate-circuit-params-form__fieldset">
        <legend>Gates</legend>
        {gates.length === 0 ? (
          <p className="gate-circuit-params-form__empty">No gates yet.</p>
        ) : (
          gates.map((gate, index) => (
            <div key={index} className="gate-circuit-params-form__gate-row">
              <label className="field">
                <span className="field__label">Type</span>
                <select
                  value={gate.type}
                  onChange={(event) => updateGate(index, { type: event.target.value })}
                  disabled={disabled}
                >
                  {GATE_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Step"
                type="number"
                min={0}
                value={gate.step}
                onChange={(event) => updateGate(index, { step: Number(event.target.value) })}
                disabled={disabled}
              />
              <fieldset className="gate-circuit-params-form__qubits">
                <legend>Qubits</legend>
                {Array.from({ length: qubitCount }, (_, qubitIndex) => (
                  <label key={qubitIndex} className="gate-circuit-params-form__qubit-checkbox">
                    <input
                      type="checkbox"
                      checked={gate.qubits.includes(qubitIndex)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...gate.qubits, qubitIndex]
                          : gate.qubits.filter((q) => q !== qubitIndex);
                        updateGate(index, { qubits: next });
                      }}
                      disabled={disabled}
                    />
                    {qubitIndex}
                  </label>
                ))}
              </fieldset>
              <Button
                type="button"
                variant="secondary"
                onClick={() => removeGate(index)}
                disabled={disabled}
                aria-label={`Remove gate ${index + 1}`}
              >
                <X size={16} aria-hidden="true" />
              </Button>
            </div>
          ))
        )}
        <Button type="button" variant="secondary" onClick={addGate} disabled={disabled}>
          <Plus size={16} aria-hidden="true" />
          Add gate
        </Button>
      </fieldset>
    </div>
  );
}
