import { useState } from "react";
import { screenService } from "../../services/screen.service.js";
import { parseApiError } from "../../utils/parseApiError.js";
import { Button } from "../ui/Button.jsx";
import { Modal } from "../ui/Modal.jsx";
import { QuestionPicker } from "./QuestionPicker.jsx";
import "./QuestionScreenForm.css";

// Phase 9 (Milestone 6). Completes the Milestone 4 stub. Screen.content for type "question" is
// deliberately empty ({} -- screen.validator.js's QuestionContentSchema) -- the real relationship
// lives on the ScreenQuestion junction, attached via POST /screens/:id/questions, entirely
// separate from ScreenForm's own content/Save flow. That means attach/detach are live API calls
// fired the moment the author picks/removes a question, not something staged until the screen's
// own Save button is pressed -- and also means a brand-new ("new") screen has no screenId yet to
// attach through, so this form can only offer the picker once the screen has been saved once
// (mirrors the Danger Zone's own create-mode gap on ContentScreenEditorPage).
export function QuestionScreenForm({
  screenId,
  attachedQuestion,
  onQuestionAttached,
  onQuestionDetached,
  disabled = false,
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [isDetaching, setIsDetaching] = useState(false);
  const [error, setError] = useState(null);

  async function handlePick(question) {
    setError(null);
    setIsAttaching(true);
    try {
      await screenService.attachQuestion(screenId, question.id);
      onQuestionAttached(question);
      setIsPickerOpen(false);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setIsAttaching(false);
    }
  }

  async function handleDetach() {
    setError(null);
    setIsDetaching(true);
    try {
      await screenService.detachQuestion(screenId, attachedQuestion.id);
      onQuestionDetached();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setIsDetaching(false);
    }
  }

  if (!screenId) {
    return (
      <p className="question-screen-form__note">
        Save this screen first, then attach a question.
      </p>
    );
  }

  return (
    <div className="question-screen-form">
      {error ? (
        <p className="question-screen-form__banner" role="alert">
          {error}
        </p>
      ) : null}

      {attachedQuestion ? (
        <div className="question-screen-form__attached">
          <p className="question-screen-form__attached-prompt">{attachedQuestion.prompt}</p>
          <div className="question-screen-form__attached-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsPickerOpen(true)}
              disabled={disabled}
            >
              Change
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleDetach}
              isLoading={isDetaching}
              disabled={disabled}
            >
              Detach
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setIsPickerOpen(true)}
          disabled={disabled}
        >
          Attach a question
        </Button>
      )}

      <Modal isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} title="Attach a question">
        <QuestionPicker onPick={handlePick} isPicking={isAttaching} />
      </Modal>
    </div>
  );
}
