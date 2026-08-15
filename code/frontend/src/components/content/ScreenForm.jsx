import { ExplanationScreenForm } from "./ExplanationScreenForm.jsx";
import { SimulationScreenForm } from "./SimulationScreenForm.jsx";
import { QuestionScreenForm } from "./QuestionScreenForm.jsx";
import "./ScreenForm.css";

// Phase 9 (Milestone 4). Owns `type` + `content`, resetting content to that type's default
// template on every type switch -- never merges stale fields across a switch, since the backend's
// per-type Zod validation (screen.validator.js's CONTENT_SCHEMAS_BY_TYPE) would reject leftover
// fields from a previous type anyway.
const TYPE_OPTIONS = [
  { value: "explanation", label: "Explanation" },
  { value: "question", label: "Question" },
  { value: "simulation", label: "Simulation" },
];

const DEFAULT_CONTENT_BY_TYPE = {
  explanation: { text: "" },
  question: {},
  simulation: { widgetType: "bloch_sphere", params: { mode: "free_placement" } },
};

export function ScreenForm({
  type,
  content,
  onTypeChange,
  onContentChange,
  disabled = false,
  screenId,
  attachedQuestion,
  onQuestionAttached,
  onQuestionDetached,
}) {
  function handleTypeChange(nextType) {
    onTypeChange(nextType, DEFAULT_CONTENT_BY_TYPE[nextType]);
  }

  return (
    <div className="screen-form">
      <label className="field">
        <span className="field__label">Screen type</span>
        <select
          value={type}
          onChange={(event) => handleTypeChange(event.target.value)}
          disabled={disabled}
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {type === "explanation" ? (
        <ExplanationScreenForm content={content} onChange={onContentChange} disabled={disabled} />
      ) : null}

      {type === "question" ? (
        <QuestionScreenForm
          screenId={screenId}
          attachedQuestion={attachedQuestion}
          onQuestionAttached={onQuestionAttached}
          onQuestionDetached={onQuestionDetached}
          disabled={disabled}
        />
      ) : null}

      {type === "simulation" ? (
        <SimulationScreenForm content={content} onChange={onContentChange} disabled={disabled} />
      ) : null}
    </div>
  );
}
