import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { lessonService } from "../services/lesson.service.js";
import { screenService } from "../services/screen.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { ScreenForm } from "../components/content/ScreenForm.jsx";
import { validateSimulationParams } from "../components/content/simulationParamsValidation.js";
import "./ContentScreenEditorPage.css";

const DEFAULT_NEW_CONTENT = { text: "" };

// Phase 9 (Milestone 4). There's no GET /screens/:id endpoint, so an edit-mode load reuses
// screenService.listForLesson (already fetched for ContentLessonDetailPage's own list) and finds
// the screen by id -- the same "derive from the parent's list" pattern ContentChapterDetailPage
// uses for chapters. `screenId === "new"` is the create-mode sentinel (route wiring in App.jsx).
export function ContentScreenEditorPage() {
  const { lessonId, screenId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = screenId === "new";

  const [lesson, setLesson] = useState(null);
  const [course, setCourse] = useState(null);
  const [screen, setScreen] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [type, setType] = useState("explanation");
  const [content, setContent] = useState(DEFAULT_NEW_CONTENT);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLesson(null);
    setCourse(null);
    setScreen(null);

    async function load() {
      try {
        const lessonResult = await lessonService.getById(lessonId);
        if (cancelled) return;
        const [courseResult, screensResult] = await Promise.all([
          courseService.getById(lessonResult.course_id),
          screenService.listForLesson(lessonId),
        ]);
        if (cancelled) return;
        setLesson(lessonResult);
        setCourse(courseResult);

        if (isNew) {
          setScreen(undefined);
          setType("explanation");
          setContent(DEFAULT_NEW_CONTENT);
        } else {
          const found = screensResult.screens.find((s) => String(s.id) === screenId);
          if (!found) {
            setError("Screen not found.");
            return;
          }
          setScreen(found);
          setType(found.type);
          setContent(found.content);
        }
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [lessonId, screenId, isNew, loadAttempt]);

  function handleTypeChange(nextType, defaultContent) {
    setType(nextType);
    setContent(defaultContent);
    setSaveSuccess(false);
  }

  function handleContentChange(nextContent) {
    setContent(nextContent);
    setSaveSuccess(false);
  }

  // QuestionScreenForm attaches/detaches live against the ScreenQuestion junction (a separate API
  // call from this page's own content/Save flow -- Screen.content for type "question" carries no
  // data of its own), so these just keep the locally-held `screen.questions` in sync with what it
  // already did server-side, the same way Save keeps `screen` in sync after a content update.
  function handleQuestionAttached(question) {
    setScreen((current) => ({ ...current, questions: [question] }));
  }

  function handleQuestionDetached() {
    setScreen((current) => ({ ...current, questions: [] }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);

    if (type === "simulation") {
      const validationError = validateSimulationParams(content.widgetType, content.params);
      if (validationError) {
        setSaveError(validationError);
        return;
      }
    }

    setIsSaving(true);
    try {
      if (isNew) {
        await screenService.create(lessonId, { type, content });
        navigate(`/admin/content/lessons/${lessonId}`);
      } else {
        const updated = await screenService.update(screenId, { type, content });
        setScreen(updated);
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
      await screenService.remove(screenId);
      navigate(`/admin/content/lessons/${lessonId}`);
    } catch (err) {
      setDeleteError(parseApiError(err).message);
      setIsModalOpen(false);
      setIsDeleting(false);
    }
  }

  if (error) {
    return (
      <main className="content-screen-editor">
        <p className="content-screen-editor__banner" role="alert">
          {error}
        </p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
      </main>
    );
  }

  if (lesson === null || course === null || screen === null) {
    return (
      <main className="content-screen-editor">
        <p className="content-screen-editor__empty">Loading&hellip;</p>
      </main>
    );
  }

  const isOwner = course.created_by_id === user.id || user.role === "admin";

  return (
    <main className="content-screen-editor">
      <Link
        to={`/admin/content/lessons/${lessonId}`}
        className="content-screen-editor__back"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {lesson.title}
      </Link>

      <Card as="section" className="content-screen-editor__section">
        <h1>{isNew ? "Add screen" : "Edit screen"}</h1>
        {!isOwner ? (
          <p className="content-screen-editor__readonly-note">
            You don&rsquo;t own this course, so it&rsquo;s read-only for you here.
          </p>
        ) : (
          <>
            {saveError ? (
              <p className="content-screen-editor__banner" role="alert">
                {saveError}
              </p>
            ) : null}
            {saveSuccess ? (
              <p
                className="content-screen-editor__banner content-screen-editor__banner--success"
                role="status"
              >
                Saved.
              </p>
            ) : null}
            <form className="content-screen-editor__form" onSubmit={handleSubmit}>
              <ScreenForm
                type={type}
                content={content}
                onTypeChange={handleTypeChange}
                onContentChange={handleContentChange}
                disabled={isSaving}
                screenId={isNew ? undefined : screenId}
                attachedQuestion={screen?.questions?.[0] ?? null}
                onQuestionAttached={handleQuestionAttached}
                onQuestionDetached={handleQuestionDetached}
              />
              <Button type="submit" isLoading={isSaving}>
                {isNew ? "Create screen" : "Save"}
              </Button>
            </form>
          </>
        )}
      </Card>

      {!isNew && isOwner ? (
        <Card
          as="section"
          className="content-screen-editor__section content-screen-editor__danger"
        >
          <h2>Danger zone</h2>
          {deleteError ? (
            <p className="content-screen-editor__banner" role="alert">
              {deleteError}
            </p>
          ) : null}
          <p className="content-screen-editor__danger-copy">
            This removes the screen from the lesson. This can&rsquo;t be undone.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setIsModalOpen(true)}
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete screen
          </Button>
        </Card>
      ) : null}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Delete this screen?"
      >
        <p>This screen will be permanently removed from the lesson.</p>
        <div className="content-screen-editor__modal-actions">
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
