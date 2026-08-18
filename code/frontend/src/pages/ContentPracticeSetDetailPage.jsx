import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { lessonService } from "../services/lesson.service.js";
import { practiceSetService } from "../services/practiceSet.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { ReorderableList } from "../components/content/ReorderableList.jsx";
import { QuestionPicker } from "../components/content/QuestionPicker.jsx";
import "./ContentPracticeSetDetailPage.css";

// Phase 9 (Milestone 7). practiceSetService.getById only returns lesson_id, not the parent
// course, so this page's own load chain runs one level deeper than ContentScreenEditorPage's
// (practice set -> lesson -> course) rather than starting from an already-known lessonId.
// Practice-set questions have no order_index of their own outside the returned array's own
// order (practice_set.repository.js), so a reorder success just re-derives local state from the
// server-confirmed orderedIds rather than patching an order_index field that doesn't exist here.
export function ContentPracticeSetDetailPage() {
  const { practiceSetId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [practiceSet, setPracticeSet] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [course, setCourse] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [questionError, setQuestionError] = useState(null);
  const [isReordering, setIsReordering] = useState(false);
  const [detachingId, setDetachingId] = useState(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPracticeSet(null);
    setLesson(null);
    setCourse(null);

    async function load() {
      try {
        const practiceSetResult = await practiceSetService.getById(practiceSetId);
        if (cancelled) return;
        const lessonResult = await lessonService.getById(practiceSetResult.lesson_id);
        if (cancelled) return;
        const courseResult = await courseService.getById(lessonResult.course_id);
        if (cancelled) return;
        setPracticeSet(practiceSetResult);
        setLesson(lessonResult);
        setCourse(courseResult);
        setTitle(practiceSetResult.title);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [practiceSetId, loadAttempt]);

  async function handleSaveSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);
    try {
      const updated = await practiceSetService.update(practiceSetId, { title });
      setPracticeSet((current) => ({ ...current, ...updated }));
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(parseApiError(err).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReorderQuestions(orderedIds) {
    setQuestionError(null);
    setIsReordering(true);
    try {
      await practiceSetService.reorderQuestions(practiceSetId, orderedIds);
      setPracticeSet((current) => ({
        ...current,
        questions: orderedIds.map((id) => current.questions.find((q) => q.id === id)),
      }));
    } catch (err) {
      setQuestionError(parseApiError(err).message);
      throw err;
    } finally {
      setIsReordering(false);
    }
  }

  // Lowest-stakes action in this phase (per the plan's own delete-confirmation table): doesn't
  // delete the question, just the junction row, and re-attaching is one click -- no confirmation.
  async function handleDetach(questionId) {
    setQuestionError(null);
    setDetachingId(questionId);
    try {
      await practiceSetService.detachQuestion(practiceSetId, questionId);
      setPracticeSet((current) => ({
        ...current,
        questions: current.questions.filter((q) => q.id !== questionId),
      }));
    } catch (err) {
      setQuestionError(parseApiError(err).message);
    } finally {
      setDetachingId(null);
    }
  }

  async function handlePick(question) {
    setQuestionError(null);
    setIsAttaching(true);
    try {
      await practiceSetService.attachQuestion(practiceSetId, question.id);
      setPracticeSet((current) => ({ ...current, questions: [...current.questions, question] }));
      setIsPickerOpen(false);
    } catch (err) {
      setQuestionError(parseApiError(err).message);
    } finally {
      setIsAttaching(false);
    }
  }

  async function handleConfirmDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await practiceSetService.remove(practiceSetId);
      navigate(`/admin/content/lessons/${lesson.id}`);
    } catch (err) {
      setDeleteError(parseApiError(err).message);
      setIsModalOpen(false);
      setIsDeleting(false);
    }
  }

  if (error) {
    return (
      <main className="content-practice-set-detail">
        <p className="content-practice-set-detail__banner" role="alert">
          {error}
        </p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
      </main>
    );
  }

  if (practiceSet === null || lesson === null || course === null) {
    return (
      <main className="content-practice-set-detail">
        <div className="content-practice-set-detail__skeleton" aria-hidden="true">
          <div className="content-practice-set-detail__skeleton-block" />
          <div className="content-practice-set-detail__skeleton-block" />
        </div>
      </main>
    );
  }

  const isOwner = course.created_by_id === user.id || user.role === "admin";

  return (
    <main className="content-practice-set-detail">
      <Link
        to={`/admin/content/lessons/${lesson.id}`}
        className="content-practice-set-detail__back"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {lesson.title}
      </Link>

      <Card as="section" className="content-practice-set-detail__section">
        <h1>{practiceSet.title}</h1>
        {!isOwner ? (
          <p className="content-practice-set-detail__readonly-note">
            You don&rsquo;t own this course, so it&rsquo;s read-only for you here.
          </p>
        ) : (
          <>
            {saveError ? (
              <p className="content-practice-set-detail__banner" role="alert">
                {saveError}
              </p>
            ) : null}
            {saveSuccess ? (
              <p
                className="content-practice-set-detail__banner content-practice-set-detail__banner--success"
                role="status"
              >
                Saved.
              </p>
            ) : null}
            <form className="content-practice-set-detail__save-form" onSubmit={handleSaveSubmit}>
              <Input
                label="Title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setSaveSuccess(false);
                }}
                required
                maxLength={200}
                disabled={isSaving}
              />
              <Button type="submit" isLoading={isSaving}>
                Save
              </Button>
            </form>
          </>
        )}
      </Card>

      <Card as="section" className="content-practice-set-detail__section">
        <h2>Questions</h2>
        {questionError ? (
          <p className="content-practice-set-detail__banner" role="alert">
            {questionError}
          </p>
        ) : null}
        {practiceSet.questions.length === 0 ? (
          <p className="content-practice-set-detail__empty">No questions yet.</p>
        ) : isOwner ? (
          <ReorderableList
            items={practiceSet.questions}
            getId={(question) => question.id}
            getLabel={(question) => question.prompt}
            isReordering={isReordering}
            onReorder={handleReorderQuestions}
            renderItem={(question) => (
              <div className="content-practice-set-detail__question-row">
                <span className="content-practice-set-detail__question-type">{question.type}</span>
                <span className="content-practice-set-detail__question-prompt">
                  {question.prompt}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleDetach(question.id)}
                  isLoading={detachingId === question.id}
                >
                  Detach
                </Button>
              </div>
            )}
          />
        ) : (
          <ul className="content-practice-set-detail__question-list">
            {practiceSet.questions.map((question) => (
              <li key={question.id} className="content-practice-set-detail__question-row">
                <span className="content-practice-set-detail__question-type">{question.type}</span>
                <span className="content-practice-set-detail__question-prompt">
                  {question.prompt}
                </span>
              </li>
            ))}
          </ul>
        )}

        {isOwner ? (
          <Button type="button" variant="secondary" onClick={() => setIsPickerOpen(true)}>
            <Plus size={16} aria-hidden="true" />
            Attach a question
          </Button>
        ) : null}
      </Card>

      {isOwner ? (
        <Card
          as="section"
          className="content-practice-set-detail__section content-practice-set-detail__danger"
        >
          <h2>Danger zone</h2>
          {deleteError ? (
            <p className="content-practice-set-detail__banner" role="alert">
              {deleteError}
            </p>
          ) : null}
          <p className="content-practice-set-detail__danger-copy">
            This removes the practice set and its question attachments. This can&rsquo;t be undone.
          </p>
          <Button type="button" variant="destructive" onClick={() => setIsModalOpen(true)}>
            <Trash2 size={16} aria-hidden="true" />
            Delete practice set
          </Button>
        </Card>
      ) : null}

      <Modal isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} title="Attach a question">
        <QuestionPicker onPick={handlePick} isPicking={isAttaching} />
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Delete this practice set?"
      >
        <p>This practice set and its question attachments will be permanently removed.</p>
        <div className="content-practice-set-detail__modal-actions">
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
