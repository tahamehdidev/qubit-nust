import { Input } from "../ui/Input.jsx";
import "./NumericContentForm.css";

// Phase 9 (Milestone 6). Field shapes come from question.validator.js's NumericContentSchema --
// the simplest of the three question content forms, just the two flat fields the backend reads.
export function NumericContentForm({ content, onChange, disabled = false }) {
  const correctValue = content.correctValue ?? 0;
  const tolerance = content.tolerance;

  function updateContent(patch) {
    onChange({ ...content, ...patch });
  }

  return (
    <div className="numeric-content-form">
      <Input
        label="Correct value"
        type="number"
        step="any"
        value={correctValue}
        onChange={(event) => updateContent({ correctValue: Number(event.target.value) })}
        disabled={disabled}
      />
      <Input
        label="Tolerance (optional)"
        type="number"
        step="any"
        min={0}
        value={tolerance ?? ""}
        onChange={(event) =>
          updateContent({
            tolerance: event.target.value === "" ? undefined : Number(event.target.value),
          })
        }
        disabled={disabled}
      />
    </div>
  );
}
