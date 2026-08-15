import { Plus, X } from "lucide-react";
import { Button } from "../ui/Button.jsx";
import "./RepeatableFieldList.css";

// Phase 9 (Milestone 5). Extracted once a second and third concrete need showed up
// (amplitude-chart label/amplitude pairs, topology-diagram qubits/edges) -- GateCircuitDiagramParamsForm's
// gates list stays its own hand-rolled version from Milestone 4 rather than being retrofitted onto
// this, since its rows have per-row qubit checkboxes that don't fit this component's plain
// row-body shape and there's no concrete need driving that refactor yet.
//
// `items`/`onChange` follow the controlled-array convention used throughout this directory
// (ReorderableList, GateCircuitDiagramParamsForm's own gates list): the caller owns the array,
// this component only ever calls back with a full next array. `renderRow(item, index, updateRow)`
// is the caller's own row body; `updateRow(nextItem)` replaces that row in place. `onAdd()` returns
// a fresh default row, called fresh each time so callers can derive next-id-style defaults (e.g.
// TopologyDiagramParamsForm's next qubit id) rather than sharing one stale template object.
export function RepeatableFieldList({
  items,
  onChange,
  renderRow,
  onAdd,
  addLabel = "Add",
  emptyText = "None yet.",
  disabled = false,
}) {
  function updateRow(index, nextItem) {
    onChange(items.map((item, i) => (i === index ? nextItem : item)));
  }

  function removeRow(index) {
    onChange(items.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...items, onAdd()]);
  }

  return (
    <div className="repeatable-field-list">
      {items.length === 0 ? (
        <p className="repeatable-field-list__empty">{emptyText}</p>
      ) : (
        items.map((item, index) => (
          <div key={index} className="repeatable-field-list__row">
            <div className="repeatable-field-list__row-body">
              {renderRow(item, index, (nextItem) => updateRow(index, nextItem))}
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => removeRow(index)}
              disabled={disabled}
              aria-label={`Remove row ${index + 1}`}
            >
              <X size={16} aria-hidden="true" />
            </Button>
          </div>
        ))
      )}
      <Button type="button" variant="secondary" onClick={addRow} disabled={disabled}>
        <Plus size={16} aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  );
}
