import { McqContentForm } from "./McqContentForm.jsx";
import { DragDropContentForm } from "./DragDropContentForm.jsx";
import { NumericContentForm } from "./NumericContentForm.jsx";
import { Input } from "../ui/Input.jsx";
import "./QuestionForm.css";

// Phase 9 (Milestone 6). Owns `type` + `content` with the same reset-on-switch rule as
// ScreenForm; prompt/hint/explanation are rendered once outside the switch since they're
// type-independent (question.validator.js's CreateQuestionSchema carries them at the top level,
// not inside `content`).
const TYPE_OPTIONS = [
  { value: "mcq", label: "Multiple choice" },
  { value: "drag_drop", label: "Drag to order" },
  { value: "numeric", label: "Numeric" },
];

const DEFAULT_CONTENT_BY_TYPE = {
  mcq: { options: ["", ""], correctOptionIndex: 0 },
  drag_drop: { items: ["", ""], correctOrder: [0, 1] },
  numeric: { correctValue: 0 },
};

const CONTENT_FORM_BY_TYPE = {
  mcq: McqContentForm,
  drag_drop: DragDropContentForm,
  numeric: NumericContentForm,
};

export function QuestionForm({
  prompt,
  onPromptChange,
  hint,
  onHintChange,
  explanation,
  onExplanationChange,
  type,
  content,
  onTypeChange,
  onContentChange,
  disabled = false,
}) {
  const ContentForm = CONTENT_FORM_BY_TYPE[type];

  function handleTypeChange(nextType) {
    onTypeChange(nextType, DEFAULT_CONTENT_BY_TYPE[nextType]);
  }

  return (
    <div className="question-form">
      <Input
        label="Prompt"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        disabled={disabled}
        required
      />

      <label className="field" htmlFor="question-form-hint">
        <span className="field__label">Hint (optional)</span>
        <textarea
          id="question-form-hint"
          className="field__control question-form__textarea"
          value={hint}
          onChange={(event) => onHintChange(event.target.value)}
          disabled={disabled}
        />
      </label>

      <label className="field" htmlFor="question-form-explanation">
        <span className="field__label">Explanation (optional)</span>
        <textarea
          id="question-form-explanation"
          className="field__control question-form__textarea"
          value={explanation}
          onChange={(event) => onExplanationChange(event.target.value)}
          disabled={disabled}
        />
      </label>

      <label className="field">
        <span className="field__label">Type</span>
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

      {ContentForm ? (
        <ContentForm content={content} onChange={onContentChange} disabled={disabled} />
      ) : null}
    </div>
  );
}
