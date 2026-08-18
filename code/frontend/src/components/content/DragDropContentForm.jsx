import { Input } from "../ui/Input.jsx";
import { RepeatableFieldList } from "./RepeatableFieldList.jsx";
import { ReorderableList } from "./ReorderableList.jsx";
import "./DragDropContentForm.css";

// Phase 9 (Milestone 6). Field shapes come from question.validator.js's DragDropContentSchema
// (items: string[], correctOrder: number[] -- indices into items, in the correct sequence) and
// DragDrop.jsx's own params-shape comment. correctOrder is derived, never typed: the author
// arranges the same items into the right sequence using ReorderableList (this component's first
// reuse for something other than sibling-record ordering), and correctOrder is read straight off
// the resulting permutation.
//
// A structural change to items (add/remove) resets correctOrder to the identity permutation
// rather than trying to patch it -- the set of things being ordered just changed, so asking the
// author to re-arrange is the honest UX, not a shortcut. A same-length change (editing an item's
// text) leaves correctOrder untouched, since positions haven't moved.
export function DragDropContentForm({ content, onChange, disabled = false }) {
  const items = content.items ?? ["", ""];
  const correctOrder = content.correctOrder ?? items.map((_, index) => index);

  function updateContent(patch) {
    onChange({ ...content, ...patch });
  }

  function handleItemsChange(nextItems) {
    if (nextItems.length === items.length) {
      updateContent({ items: nextItems });
    } else {
      updateContent({ items: nextItems, correctOrder: nextItems.map((_, index) => index) });
    }
  }

  function handleReorderCorrectOrder(nextOrderedIds) {
    updateContent({ correctOrder: nextOrderedIds });
  }

  const orderRows = correctOrder.map((itemIndex) => ({
    id: itemIndex,
    label: items[itemIndex] ?? "",
  }));

  return (
    <div className="drag-drop-content-form">
      <fieldset className="drag-drop-content-form__fieldset">
        <legend>Items</legend>
        <RepeatableFieldList
          items={items}
          onChange={handleItemsChange}
          onAdd={() => ""}
          addLabel="Add item"
          emptyText="No items yet."
          disabled={disabled}
          renderRow={(item, index, updateRow) => (
            <Input
              label={`Item ${index + 1}`}
              value={item}
              onChange={(event) => updateRow(event.target.value)}
              disabled={disabled}
            />
          )}
        />
      </fieldset>

      <fieldset className="drag-drop-content-form__fieldset">
        <legend>Correct order</legend>
        <p className="drag-drop-content-form__hint">
          Drag or use the move buttons to arrange these into the correct sequence.
        </p>
        <ReorderableList
          items={orderRows}
          getId={(row) => row.id}
          getLabel={(row) => row.label}
          onReorder={handleReorderCorrectOrder}
          renderItem={(row) => (
            <span className="drag-drop-content-form__order-label">{row.label || "(empty)"}</span>
          )}
        />
      </fieldset>
    </div>
  );
}
