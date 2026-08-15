import "./ExplanationScreenForm.css";

// Phase 9 (Milestone 4). One `text` textarea -- the hand-rolled `field`/`field__control` pattern
// already established in CohortDetailPage.jsx's bulk-emails textarea, not a reusable wrapper
// component (no second caller yet to justify extracting one).
export function ExplanationScreenForm({ content, onChange, disabled = false }) {
  return (
    <label className="field" htmlFor="explanation-screen-form-text">
      <span className="field__label">Text</span>
      <textarea
        id="explanation-screen-form-text"
        className="field__control explanation-screen-form__textarea"
        value={content.text ?? ""}
        onChange={(event) => onChange({ text: event.target.value })}
        disabled={disabled}
        required
      />
    </label>
  );
}
