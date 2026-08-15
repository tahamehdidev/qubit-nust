import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { questionService } from "../services/question.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { QuestionForm } from "../components/content/QuestionForm.jsx";
import "./QuestionEditPage.css";

const DEFAULT_NEW_CONTENT = { options: ["", ""], correctOptionIndex: 0 };

// Phase 9 (Milestone 6). Create and edit share this one route/form (questionId === "new" is the
// create-mode sentinel, same convention as ContentScreenEditorPage). No ownership gating here --
// unlike Course/Chapter/Lesson, question edit access isn't simple ownership (Variant D: creator
// OR attached-to-an-owned-course via either junction path -- question.service.js's
// checkEditAccess), and there's no cheap way to compute that client-side without a dedicated
// endpoint. The form is always shown to any instructor/admin; an unauthorized save surfaces the
// backend's real 403 through the normal error-banner path instead of a wrong client-side guess.
export function QuestionEditPage() {
  const { questionId } = useParams();
  const navigate = useNavigate();
  const isNew = questionId === "new";

  const [prompt, setPrompt] = useState("");
  const [hint, setHint] = useState("");
  const [explanation, setExplanation] = useState("");
  const [type, setType] = useState("mcq");
  const [content, setContent] = useState(DEFAULT_NEW_CONTENT);

  const [isLoaded, setIsLoaded] = useState(isNew);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    setError(null);
    setIsLoaded(false);

    async function load() {
      try {
        const question = await questionService.getById(questionId);
        if (cancelled) return;
        setPrompt(question.prompt);
        setHint(question.hint ?? "");
        setExplanation(question.explanation ?? "");
        setType(question.type);
        setContent(question.content);
        setIsLoaded(true);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [questionId, isNew, loadAttempt]);

  function handleTypeChange(nextType, defaultContent) {
    setType(nextType);
    setContent(defaultContent);
    setSaveSuccess(false);
  }

  function handleContentChange(nextContent) {
    setContent(nextContent);
    setSaveSuccess(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);
    try {
      const payload = { prompt, type, content, hint: hint || undefined, explanation: explanation || undefined };
      if (isNew) {
        const question = await questionService.create(payload);
        navigate(`/admin/content/questions/${question.id}`);
      } else {
        await questionService.update(questionId, payload);
        setSaveSuccess(true);
      }
    } catch (err) {
      setSaveError(parseApiError(err).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await questionService.remove(questionId);
      navigate("/admin/content/questions");
    } catch (err) {
      setDeleteError(parseApiError(err).message);
      setIsModalOpen(false);
      setIsDeleting(false);
    }
  }

  if (error) {
    return (
      <main className="question-edit">
        <p className="question-edit__banner" role="alert">
          {error}
        </p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
      </main>
    );
  }

  if (!isLoaded) {
    return (
      <main className="question-edit">
        <p className="question-edit__empty">Loading&hellip;</p>
      </main>
    );
  }

  return (
    <main className="question-edit">
      <Link to="/admin/content/questions" className="question-edit__back">
        <ArrowLeft size={16} aria-hidden="true" />
        Question bank
      </Link>

      <Card as="section" className="question-edit__section">
        <h1>{isNew ? "New question" : "Edit question"}</h1>
        {saveError ? (
          <p className="question-edit__banner" role="alert">
            {saveError}
          </p>
        ) : null}
        {saveSuccess ? (
          <p className="question-edit__banner question-edit__banner--success" role="status">
            Saved.
          </p>
        ) : null}
        <form className="question-edit__form" onSubmit={handleSubmit}>
          <QuestionForm
            prompt={prompt}
            onPromptChange={(value) => {
              setPrompt(value);
              setSaveSuccess(false);
            }}
            hint={hint}
            onHintChange={(value) => {
              setHint(value);
              setSaveSuccess(false);
            }}
            explanation={explanation}
            onExplanationChange={(value) => {
              setExplanation(value);
              setSaveSuccess(false);
            }}
            type={type}
            content={content}
            onTypeChange={handleTypeChange}
            onContentChange={handleContentChange}
            disabled={isSaving}
          />
          <Button type="submit" isLoading={isSaving}>
            {isNew ? "Create question" : "Save"}
          </Button>
        </form>
      </Card>

      {!isNew ? (
        <Card as="section" className="question-edit__section question-edit__danger">
          <h2>Danger zone</h2>
          {deleteError ? (
            <p className="question-edit__banner" role="alert">
              {deleteError}
            </p>
          ) : null}
          <p className="question-edit__danger-copy">
            This will remove the question from every screen and practice set that currently uses
            it. This can&rsquo;t be undone.
          </p>
          <Button type="button" variant="destructive" onClick={() => setIsModalOpen(true)}>
            <Trash2 size={16} aria-hidden="true" />
            Delete question
          </Button>
        </Card>
      ) : null}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Delete this question?"
      >
        <p>
          This will remove the question from every screen and practice set that currently uses
          it. This can&rsquo;t be undone.
        </p>
        <div className="question-edit__modal-actions">
          <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            isLoading={isDeleting}
            onClick={handleConfirmDelete}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </main>
  );
}
