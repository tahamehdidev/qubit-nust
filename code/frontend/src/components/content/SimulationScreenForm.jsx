import { BlochSphereParamsForm } from "./BlochSphereParamsForm.jsx";
import { GateCircuitDiagramParamsForm } from "./GateCircuitDiagramParamsForm.jsx";
import "./SimulationScreenForm.css";

// Phase 9 (Milestone 4). Widget types not yet built get a stub note rather than a broken form --
// the remaining four (amplitude_bar_chart, topology_diagram, quadrant_selector, basis_encoder)
// are Milestone 5's job (screen.validator.js doesn't validate their params either, so there's no
// schema this milestone could build against yet).
const WIDGET_TYPE_OPTIONS = [
  { value: "bloch_sphere", label: "Bloch sphere" },
  { value: "gate_circuit_diagram", label: "Gate circuit diagram" },
  { value: "amplitude_bar_chart", label: "Amplitude bar chart" },
  { value: "topology_diagram", label: "Topology diagram" },
  { value: "quadrant_selector", label: "Quadrant selector" },
  { value: "basis_encoder", label: "Basis encoder" },
];

const DEFAULT_PARAMS_BY_WIDGET_TYPE = {
  bloch_sphere: { mode: "free_placement" },
  gate_circuit_diagram: { qubitCount: 1, gates: [] },
};

const PARAMS_FORM_BY_WIDGET_TYPE = {
  bloch_sphere: BlochSphereParamsForm,
  gate_circuit_diagram: GateCircuitDiagramParamsForm,
};

export function SimulationScreenForm({ content, onChange, disabled = false }) {
  const widgetType = content.widgetType ?? "bloch_sphere";
  const params = content.params ?? {};
  const ParamsForm = PARAMS_FORM_BY_WIDGET_TYPE[widgetType];

  function handleWidgetTypeChange(nextWidgetType) {
    onChange({
      widgetType: nextWidgetType,
      params: DEFAULT_PARAMS_BY_WIDGET_TYPE[nextWidgetType] ?? {},
    });
  }

  return (
    <div className="simulation-screen-form">
      <label className="field">
        <span className="field__label">Widget type</span>
        <select
          value={widgetType}
          onChange={(event) => handleWidgetTypeChange(event.target.value)}
          disabled={disabled}
        >
          {WIDGET_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {ParamsForm ? (
        <ParamsForm
          params={params}
          onChange={(nextParams) => onChange({ widgetType, params: nextParams })}
          disabled={disabled}
        />
      ) : (
        <p className="simulation-screen-form__stub-note">
          This widget type&rsquo;s authoring form isn&rsquo;t built yet.
        </p>
      )}
    </div>
  );
}
