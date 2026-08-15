import { Input } from "../ui/Input.jsx";
import { RepeatableFieldList } from "./RepeatableFieldList.jsx";
import "./AmplitudeBarChartParamsForm.css";

// Phase 9 (Milestone 5). Field shapes come from AmplitudeBarChart.jsx's own params-shape comment
// and AmplitudeBarChart.fixtures.js -- the backend does not validate this widgetType's params at
// all (SIMULATION_PARAMS_SCHEMAS_BY_WIDGET_TYPE has no entry for it), so this form's own shape is
// the only thing keeping an author from saving a broken screen; see simulationParamsValidation.js
// for the submit-time guardrail this form's shape is designed to satisfy.
//
// labels/amplitudes are stored on params as two parallel arrays (the widget's own contract), but
// edited here as one combined row per basis state -- simpler for an author to keep a label and its
// amplitude together than to manage two separately-reorderable lists that must stay the same length.
export function AmplitudeBarChartParamsForm({ params, onChange, disabled = false }) {
  const caption = params.caption ?? "";
  const amplitudes = params.amplitudes ?? [];
  const labels = params.labels ?? [];
  const highlightedIndex = params.highlightedIndex;

  const rows = amplitudes.map((amplitude, index) => ({ label: labels[index] ?? "", amplitude }));

  function updateParams(patch) {
    onChange({ ...params, ...patch });
  }

  function handleRowsChange(nextRows) {
    updateParams({
      amplitudes: nextRows.map((row) => row.amplitude),
      labels: nextRows.map((row) => row.label),
    });
  }

  return (
    <div className="amplitude-bar-chart-params-form">
      <Input
        label="Caption (optional)"
        value={caption}
        onChange={(event) => updateParams({ caption: event.target.value })}
        disabled={disabled}
      />

      <RepeatableFieldList
        items={rows}
        onChange={handleRowsChange}
        onAdd={() => ({ label: "", amplitude: 0 })}
        addLabel="Add basis state"
        emptyText="No basis states yet."
        disabled={disabled}
        renderRow={(row, index, updateRow) => (
          <>
            <Input
              label="Label"
              value={row.label}
              onChange={(event) => updateRow({ ...row, label: event.target.value })}
              disabled={disabled}
            />
            <Input
              label="Amplitude"
              type="number"
              step="any"
              value={row.amplitude}
              onChange={(event) => updateRow({ ...row, amplitude: Number(event.target.value) })}
              disabled={disabled}
            />
          </>
        )}
      />

      <label className="field">
        <span className="field__label">Highlighted state (optional)</span>
        <select
          value={highlightedIndex ?? ""}
          onChange={(event) =>
            updateParams({
              highlightedIndex: event.target.value === "" ? undefined : Number(event.target.value),
            })
          }
          disabled={disabled}
        >
          <option value="">None</option>
          {rows.map((row, index) => (
            <option key={index} value={index}>
              {row.label || `State ${index}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
