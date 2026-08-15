import { Input } from "../ui/Input.jsx";
import { RepeatableFieldList } from "./RepeatableFieldList.jsx";
import "./TopologyDiagramParamsForm.css";

// Phase 9 (Milestone 5). Field shapes come from TopologyDiagram.jsx's own params-shape comment
// and TopologyDiagram.fixtures.js -- another widgetType the backend doesn't validate at all.
// Qubit ids are assigned once on creation (nextQubitId below) and never renumbered when a row is
// removed, so existing edges referencing a surviving qubit's id stay valid; an edge referencing a
// since-removed qubit is caught by simulationParamsValidation.js at submit time rather than
// silently repaired here.
function nextQubitId(qubits) {
  return qubits.length === 0 ? 0 : Math.max(...qubits.map((q) => q.id)) + 1;
}

export function TopologyDiagramParamsForm({ params, onChange, disabled = false }) {
  const caption = params.caption ?? "";
  const qubits = params.qubits ?? [];
  const edges = params.edges ?? [];

  function updateParams(patch) {
    onChange({ ...params, ...patch });
  }

  return (
    <div className="topology-diagram-params-form">
      <Input
        label="Caption (optional)"
        value={caption}
        onChange={(event) => updateParams({ caption: event.target.value })}
        disabled={disabled}
      />

      <fieldset className="topology-diagram-params-form__fieldset">
        <legend>Qubits</legend>
        <RepeatableFieldList
          items={qubits}
          onChange={(next) => updateParams({ qubits: next })}
          onAdd={() => ({ id: nextQubitId(qubits), x: 0, y: 0, label: "" })}
          addLabel="Add qubit"
          emptyText="No qubits yet."
          disabled={disabled}
          renderRow={(qubit, index, updateRow) => (
            <>
              <Input
                label="X"
                type="number"
                min={0}
                value={qubit.x}
                onChange={(event) => updateRow({ ...qubit, x: Number(event.target.value) })}
                disabled={disabled}
              />
              <Input
                label="Y"
                type="number"
                min={0}
                value={qubit.y}
                onChange={(event) => updateRow({ ...qubit, y: Number(event.target.value) })}
                disabled={disabled}
              />
              <Input
                label="Label (optional)"
                value={qubit.label ?? ""}
                onChange={(event) => updateRow({ ...qubit, label: event.target.value })}
                disabled={disabled}
              />
            </>
          )}
        />
      </fieldset>

      <fieldset className="topology-diagram-params-form__fieldset">
        <legend>Edges</legend>
        <RepeatableFieldList
          items={edges}
          onChange={(next) => updateParams({ edges: next })}
          onAdd={() => [qubits[0]?.id ?? 0, qubits[1]?.id ?? qubits[0]?.id ?? 0]}
          addLabel="Add edge"
          emptyText="No edges yet."
          disabled={disabled || qubits.length < 2}
          renderRow={(edge, index, updateRow) => (
            <>
              <label className="field">
                <span className="field__label">From qubit</span>
                <select
                  value={edge[0]}
                  onChange={(event) => updateRow([Number(event.target.value), edge[1]])}
                  disabled={disabled}
                >
                  {qubits.map((qubit) => (
                    <option key={qubit.id} value={qubit.id}>
                      {qubit.label || `Q${qubit.id}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">To qubit</span>
                <select
                  value={edge[1]}
                  onChange={(event) => updateRow([edge[0], Number(event.target.value)])}
                  disabled={disabled}
                >
                  {qubits.map((qubit) => (
                    <option key={qubit.id} value={qubit.id}>
                      {qubit.label || `Q${qubit.id}`}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        />
      </fieldset>
    </div>
  );
}
