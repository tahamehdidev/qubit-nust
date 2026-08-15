import { Input } from "../ui/Input.jsx";
import "./BlochSphereParamsForm.css";

// Phase 9 (Milestone 4). Field shapes come directly from screen.validator.js's
// BlochSphereParamsSchema -- one of only two widget types the backend actually validates
// per-field (screen.validator.js:33-51 in the backend repo), so this form's shape is a hard
// contract, not a guess.
const MODE_OPTIONS = [
  { value: "free_placement", label: "Free placement" },
  { value: "gate_application", label: "Gate application" },
  { value: "rotation_slider", label: "Rotation slider" },
  { value: "measurement", label: "Measurement" },
  { value: "t1_decay", label: "T1 decay" },
  { value: "t2_dephasing", label: "T2 dephasing" },
];

// startState is either one of these four enum values or a raw [re, im] tuple
// (screen.validator.js's StartStateSchema) -- the fixture set (components/widgets/
// BlochSphere.fixtures.js) only ever uses the enum form, so that's the form's default; "Custom"
// reveals the tuple inputs for the rarer case.
const ENUM_START_STATES = ["0", "1", "+", "-"];

// Matches the one real gate_application fixture's availableGates set exactly
// (BlochSphere.fixtures.js's gateApplicationParams) rather than inventing a longer list nothing
// in this codebase actually uses yet.
const AVAILABLE_GATE_OPTIONS = ["H", "X", "Z", "Rx"];

export function BlochSphereParamsForm({ params, onChange, disabled = false }) {
  const mode = params.mode ?? "free_placement";
  const startState = params.startState ?? "0";
  const isCustomStartState = Array.isArray(startState);

  function updateParams(patch) {
    onChange({ ...params, ...patch });
  }

  function handleStartStateSelectChange(value) {
    updateParams({ startState: value === "custom" ? [0, 0] : value });
  }

  return (
    <div className="bloch-sphere-params-form">
      <label className="field">
        <span className="field__label">Mode</span>
        <select
          value={mode}
          onChange={(event) => updateParams({ mode: event.target.value })}
          disabled={disabled}
        >
          {MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field__label">Start state</span>
        <select
          value={isCustomStartState ? "custom" : startState}
          onChange={(event) => handleStartStateSelectChange(event.target.value)}
          disabled={disabled}
        >
          {ENUM_START_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
          <option value="custom">Custom amplitudes</option>
        </select>
      </label>

      {isCustomStartState ? (
        <div className="bloch-sphere-params-form__tuple-row">
          <Input
            label="Real part"
            type="number"
            value={startState[0]}
            onChange={(event) =>
              updateParams({ startState: [Number(event.target.value), startState[1]] })
            }
            disabled={disabled}
          />
          <Input
            label="Imaginary part"
            type="number"
            value={startState[1]}
            onChange={(event) =>
              updateParams({ startState: [startState[0], Number(event.target.value)] })
            }
            disabled={disabled}
          />
        </div>
      ) : null}

      {mode === "gate_application" ? (
        <fieldset className="bloch-sphere-params-form__gates">
          <legend>Available gates</legend>
          {AVAILABLE_GATE_OPTIONS.map((gate) => (
            <label key={gate} className="bloch-sphere-params-form__gate-checkbox">
              <input
                type="checkbox"
                checked={(params.availableGates ?? []).includes(gate)}
                onChange={(event) => {
                  const current = params.availableGates ?? [];
                  const next = event.target.checked
                    ? [...current, gate]
                    : current.filter((g) => g !== gate);
                  updateParams({ availableGates: next });
                }}
                disabled={disabled}
              />
              {gate}
            </label>
          ))}
        </fieldset>
      ) : null}

      {mode === "rotation_slider" ? (
        <Input
          label="Slider label"
          value={params.sliderLabel ?? ""}
          onChange={(event) => updateParams({ sliderLabel: event.target.value })}
          disabled={disabled}
        />
      ) : null}

      {mode === "t1_decay" ? (
        <Input
          label="T1 (ms)"
          type="number"
          value={params.t1Ms ?? ""}
          onChange={(event) => updateParams({ t1Ms: Number(event.target.value) })}
          disabled={disabled}
        />
      ) : null}

      {mode === "t2_dephasing" ? (
        <Input
          label="T2 (ms)"
          type="number"
          value={params.t2Ms ?? ""}
          onChange={(event) => updateParams({ t2Ms: Number(event.target.value) })}
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}
