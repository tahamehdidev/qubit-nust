import { Input } from "../ui/Input.jsx";
import "./BasisEncoderParamsForm.css";

// Phase 9 (Milestone 5). Field shapes come from BasisEncoder.jsx's own params-shape comment and
// BasisEncoder.fixtures.js -- another widgetType the backend doesn't validate at all. The
// simplest of the four new forms: no repeatable state, just the three flat fields the widget reads.
export function BasisEncoderParamsForm({ params, onChange, disabled = false }) {
  const caption = params.caption ?? "";
  const qubitCount = params.qubitCount ?? 1;
  const defaultNumber = params.defaultNumber ?? 0;

  function updateParams(patch) {
    onChange({ ...params, ...patch });
  }

  return (
    <div className="basis-encoder-params-form">
      <Input
        label="Caption (optional)"
        value={caption}
        onChange={(event) => updateParams({ caption: event.target.value })}
        disabled={disabled}
      />
      <Input
        label="Qubit count"
        type="number"
        min={1}
        value={qubitCount}
        onChange={(event) => updateParams({ qubitCount: Number(event.target.value) })}
        disabled={disabled}
      />
      <Input
        label="Default number"
        type="number"
        min={0}
        value={defaultNumber}
        onChange={(event) => updateParams({ defaultNumber: Number(event.target.value) })}
        disabled={disabled}
      />
    </div>
  );
}
