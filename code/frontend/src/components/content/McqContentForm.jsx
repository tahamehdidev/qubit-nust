import { Input } from "../ui/Input.jsx";
import { RepeatableFieldList } from "./RepeatableFieldList.jsx";
import "./McqContentForm.css";

// Phase 9 (Milestone 6). Field shapes come from question.validator.js's McqContentSchema
// (options: string[] min 2, correctOptionIndex: number). correctOptionIndex is set by clicking a
// radio next to the right option -- the author never hand-types an index, per the plan's own
// requirement. Removing an option shifts every later option's position, so correctOptionIndex
// (which references a position, not an option's identity) must be adjusted precisely: reset to 0
// if the removed option WAS the correct one, decremented if a row before it was removed, left
// alone otherwise. RepeatableFieldList's `{ removedIndex }` (its onChange's second argument) is
// what makes this exact rather than a guess -- diffing the before/after arrays by value would
// silently misfire whenever two options share the same text.
export function McqContentForm({ content, onChange, disabled = false }) {
  const options = content.options ?? ["", ""];
  const correctOptionIndex = content.correctOptionIndex ?? 0;

  function updateContent(patch) {
    onChange({ ...content, ...patch });
  }

  function handleOptionsChange(nextOptions, { removedIndex } = {}) {
    let nextCorrectIndex = correctOptionIndex;
    if (removedIndex === correctOptionIndex) {
      nextCorrectIndex = 0;
    } else if (removedIndex !== undefined && removedIndex < correctOptionIndex) {
      nextCorrectIndex = correctOptionIndex - 1;
    }
    updateContent({ options: nextOptions, correctOptionIndex: nextCorrectIndex });
  }

  return (
    <div className="mcq-content-form">
      <RepeatableFieldList
        items={options}
        onChange={handleOptionsChange}
        onAdd={() => ""}
        addLabel="Add option"
        emptyText="No options yet."
        disabled={disabled}
        renderRow={(option, index, updateRow) => (
          <>
            <label className="mcq-content-form__correct-radio">
              <input
                type="radio"
                name="mcq-content-form-correct-option"
                checked={index === correctOptionIndex}
                onChange={() => updateContent({ correctOptionIndex: index })}
                disabled={disabled}
              />
              Correct
            </label>
            <Input
              label={`Option ${index + 1}`}
              value={option}
              onChange={(event) => updateRow(event.target.value)}
              disabled={disabled}
            />
          </>
        )}
      />
    </div>
  );
}
