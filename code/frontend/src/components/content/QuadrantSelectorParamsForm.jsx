import { Input } from "../ui/Input.jsx";
import "./QuadrantSelectorParamsForm.css";

// Phase 9 (Milestone 5). Field shapes come from QuadrantSelector.jsx's own params-shape comment
// and QuadrantSelector.fixtures.js -- another widgetType the backend doesn't validate at all.
// Unlike AmplitudeBarChartParamsForm/TopologyDiagramParamsForm this isn't a repeatable list:
// xAxisValues/yAxisValues are fixed at exactly 2 entries and quadrants at fixed 4, matching the
// widget's own row-major reading order (quadrants[0] = yAxisValues[0]+xAxisValues[0], [1] =
// yAxisValues[0]+xAxisValues[1], [2] = yAxisValues[1]+xAxisValues[0], [3] =
// yAxisValues[1]+xAxisValues[1]), so RepeatableFieldList's add/remove semantics don't apply here.
const DEFAULT_QUADRANTS = [
  { label: "", description: "", highlighted: true },
  { label: "", description: "", highlighted: false },
  { label: "", description: "", highlighted: false },
  { label: "", description: "", highlighted: false },
];

export function QuadrantSelectorParamsForm({ params, onChange, disabled = false }) {
  const caption = params.caption ?? "";
  const xAxisLabel = params.xAxisLabel ?? "";
  const yAxisLabel = params.yAxisLabel ?? "";
  const xAxisValues = params.xAxisValues ?? ["", ""];
  const yAxisValues = params.yAxisValues ?? ["", ""];
  const quadrants = params.quadrants ?? DEFAULT_QUADRANTS;

  function updateParams(patch) {
    onChange({ ...params, ...patch });
  }

  function updateQuadrant(index, patch) {
    updateParams({ quadrants: quadrants.map((q, i) => (i === index ? { ...q, ...patch } : q)) });
  }

  function setHighlighted(index) {
    updateParams({ quadrants: quadrants.map((q, i) => ({ ...q, highlighted: i === index })) });
  }

  return (
    <div className="quadrant-selector-params-form">
      <Input
        label="Caption (optional)"
        value={caption}
        onChange={(event) => updateParams({ caption: event.target.value })}
        disabled={disabled}
      />

      <div className="quadrant-selector-params-form__axis-row">
        <Input
          label="X axis label"
          value={xAxisLabel}
          onChange={(event) => updateParams({ xAxisLabel: event.target.value })}
          disabled={disabled}
          required
        />
        <Input
          label="X value 1"
          value={xAxisValues[0]}
          onChange={(event) => updateParams({ xAxisValues: [event.target.value, xAxisValues[1]] })}
          disabled={disabled}
          required
        />
        <Input
          label="X value 2"
          value={xAxisValues[1]}
          onChange={(event) => updateParams({ xAxisValues: [xAxisValues[0], event.target.value] })}
          disabled={disabled}
          required
        />
      </div>

      <div className="quadrant-selector-params-form__axis-row">
        <Input
          label="Y axis label"
          value={yAxisLabel}
          onChange={(event) => updateParams({ yAxisLabel: event.target.value })}
          disabled={disabled}
          required
        />
        <Input
          label="Y value 1"
          value={yAxisValues[0]}
          onChange={(event) => updateParams({ yAxisValues: [event.target.value, yAxisValues[1]] })}
          disabled={disabled}
          required
        />
        <Input
          label="Y value 2"
          value={yAxisValues[1]}
          onChange={(event) => updateParams({ yAxisValues: [yAxisValues[0], event.target.value] })}
          disabled={disabled}
          required
        />
      </div>

      <fieldset className="quadrant-selector-params-form__fieldset">
        <legend>Quadrants</legend>
        {quadrants.map((quadrant, index) => (
          <div key={index} className="quadrant-selector-params-form__quadrant-row">
            <span className="quadrant-selector-params-form__quadrant-combo">
              {yAxisValues[Math.floor(index / 2)] || "—"} &times;{" "}
              {xAxisValues[index % 2] || "—"}
            </span>
            <Input
              label="Label"
              value={quadrant.label}
              onChange={(event) => updateQuadrant(index, { label: event.target.value })}
              disabled={disabled}
              required
            />
            <label className="field">
              <span className="field__label">Description</span>
              <textarea
                className="field__control"
                value={quadrant.description}
                onChange={(event) => updateQuadrant(index, { description: event.target.value })}
                disabled={disabled}
                required
              />
            </label>
            <label className="quadrant-selector-params-form__highlight-radio">
              <input
                type="radio"
                name="quadrant-selector-highlighted"
                checked={quadrant.highlighted}
                onChange={() => setHighlighted(index)}
                disabled={disabled}
              />
              Highlighted
            </label>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
