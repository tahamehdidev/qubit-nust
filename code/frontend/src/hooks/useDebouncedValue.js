import { useEffect, useState } from "react";

// Phase 9 (Milestone 6). Extracted straight away rather than waiting for a second/third caller
// like RepeatableFieldList did -- QuestionBankPage and QuestionPicker both need the exact same
// debounced-search behavior in this same milestone, so the "wait for evidence" reasoning that
// applies to speculative abstractions doesn't apply here: the second consumer already exists.
export function useDebouncedValue(value, delayMs = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
