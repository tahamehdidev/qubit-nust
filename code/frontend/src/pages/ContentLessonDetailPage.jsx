import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { lessonService } from "../services/lesson.service.js";
import { screenService } from "../services/screen.service.js";
import { practiceSetService } from "../services/practiceSet.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Button } from "../components/ui/Button.jsx";
import { ConfirmDeleteModal } from "../components/ui/ConfirmDeleteModal.jsx";
import { ReorderableList } from "../components/content/ReorderableList.jsx";
import "./ContentLessonDetailPage.css";

const WIDGET_TYPE_LABELS = {
  bloch_sphere: "Bloch sphere",
  gate_circuit_diagram: "Gate circuit diagram",
  amplitude_bar_chart: "Amplitude bar chart",
  topology_diagram: "Topology diagram",
  quadrant_selector: "Quadrant selector",
  basis_encoder: "Basis encoder",
};

function describeScreen(screen) {
  if (screen.type === "explanation") {
    const text = screen.content?.text ?? "";
    return text.length > 80 ? `${text.slice(0, 80)}…` : text || "(empty)";
  }
  if (screen.type === "simulation") {
    const widgetType = screen.content?.widgetType;
    return `Simulation — ${WIDGET_TYPE_LABELS[widgetType] ?? widgetType ?? "unknown"}`;
  }
  const question = screen.questions?.[0];
  return question ? question.prompt : "Question (none attached yet)";
}

// Phase 9 (Milestone 4). lessonService.getById is a real endpoint (unlike chapters), so this page
// is fully self-sufficient -- no router-state dependency, a direct deep-link/refresh works.
// Phase 9 (Milestone 7): the practice-sets sub-section (list + create, deferred from Milestone 4)
// is list+create only, no reorder -- practice sets have no order_index of their own
// (practice_set.repository.js's own comment), and delete lives on each practice set's own detail
// page's Danger Zone, matching the Course→Chapter/Chapter→Lesson pattern of the parent list being
// create+link-only.
export function ContentLessonDetailPage() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [lesson, setLesson] = useState(null);
  const [course, setCourse] = useState(null);
  const [screens, setScreens] = useState(null);
  const [practiceSets, setPracticeSets] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [screenError, setScreenError] = useState(null);
  const [isReorderingScreens, setIsReorderingScreens] = useState(false);

  const [newPracticeSetTitle, setNewPracticeSetTitle] = useState("");
  const [isCreatingPracticeSet, setIsCreatingPracticeSet] = useState(false);
  const [practiceSetError, setPracticeSetError] = useState(null);

  const [isProbingDelete, setIsProbingDelete] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLesson(null);
    setCourse(null);
    setScreens(null);
    setPracticeSets(null);

    async function load() {
      try {
        const lessonResult = await lessonService.getById(lessonId);
        if (cancelled) return;
        const [courseResult, screensResult, practiceSetsResult] = await Promise.all([
          courseService.getById(lessonResult.course_id),
          screenService.listForLesson(lessonId),
          practiceSetService.listForLesson(lessonId),
        ]);
        if (cancelled) return;
        setLesson(lessonResult);
        setCourse(courseResult);
        setScreens(screensResult.screens);
        setPracticeSets(practiceSetsResult.practiceSets);
        setTitle(lessonResult.title);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [lessonId, loadAttempt]);

  async function handleSaveSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);
    try {
      const updated = await lessonService.update(lessonId, { title });
      setLesson((current) => ({ ...current, ...updated }));
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(parseApiError(err).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReorderScreens(orderedIds) {
    setScreenError(null);
    setIsReorderingScreens(true);
    try {
      await screenService.reorder(lessonId, orderedIds);
      setScreens((current) =>
        current.map((screen) => ({
          ...screen,
          order_index: orderedIds.indexOf(screen.id) + 1,
        }))
      );
    } catch (err) {
      setScreenError(parseApiError(err).message);
      throw err;
    } finally {
      setIsReorderingScreens(false);
    }
  }

  async function handleAddPracticeSet(event) {
    event.preventDefault();
    setPracticeSetError(null);
    setIsCreatingPracticeSet(true);
    try {
      const practiceSet = await practiceSetService.create(lessonId, { title: newPracticeSetTitle });
      setPracticeSets((current) => [...current, practiceSet]);
      setNewPracticeSetTitle("");
    } catch (err) {
      setPracticeSetError(parseApiError(err).message);
    } finally {
      setIsCreatingPracticeSet(false);
    }
  }

  async function handleDeleteClick() {
    setDeleteError(null);
    setIsProbingDelete(true);
    try {
      await lessonService.remove(lessonId);
    } catch (err) {
      setDeleteWarning(parseApiError(err).message);
      setIsModalOpen(true);
    } finally {
      setIsProbingDelete(false);
    }
  }

  async function handleConfirmDelete() {
    setIsDeleting(true);
    try {
      await lessonService.remove(lessonId, { confirm: true });
      navigate(`/admin/content/chapters/${lesson.chapter_id}`, {
        state: { courseId: course.id, courseTitle: course.title },
      });
    } catch (err) {
      setDeleteError(parseApiError(err).message);
      setIsModalOpen(false);
      setIsDeleting(false);
    }
  }

  if (error) {
    return (
      <main className="content-lesson-detail">
        <p className="content-lesson-detail__banner" role="alert">
          {error}
        </p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
      </main>
    );
  }

  if (lesson === null || course === null || screens === null || practiceSets === null) {
    return (
      <main className="content-lesson-detail">
        <div className="content-lesson-detail__skeleton" aria-hidden="true">
          <div className="content-lesson-detail__skeleton-block" />
          <div className="content-lesson-detail__skeleton-block" />
        </div>
      </main>
    );
  }

  const isOwner = course.created_by_id === user.id || user.role === "admin";
  const chapter = course.chapters.find((c) => c.id === lesson.chapter_id);
  const sortedScreens = [...screens].sort((a, b) => a.order_index - b.order_index);

  return (
    <main className="content-lesson-detail">
      <Link
        to={`/admin/content/chapters/${lesson.chapter_id}`}
        state={{ courseId: course.id, courseTitle: course.title }}
        className="content-lesson-detail__back"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {chapter ? chapter.title : course.title}
      </Link>

      <Card as="section" className="content-lesson-detail__section">
        <h1>{lesson.title}</h1>
        {!isOwner ? (
          <p className="content-lesson-detail__readonly-note">
            You don&rsquo;t own this course, so it&rsquo;s read-only for you here.
          </p>
        ) : (
          <>
            {saveError ? (
              <p className="content-lesson-detail__banner" role="alert">
                {saveError}
              </p>
            ) : null}
            {saveSuccess ? (
              <p
                className="content-lesson-detail__banner content-lesson-detail__banner--success"
                role="status"
              >
                Saved.
              </p>
            ) : null}
            <form className="content-lesson-detail__save-form" onSubmit={handleSaveSubmit}>
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

      <Card as="section" className="content-lesson-detail__section">
        <h2>Screens</h2>
        {screenError ? (
          <p className="content-lesson-detail__banner" role="alert">
            {screenError}
          </p>
        ) : null}
        {sortedScreens.length === 0 ? (
          <p className="content-lesson-detail__empty">No screens yet.</p>
        ) : isOwner ? (
          <ReorderableList
            items={sortedScreens}
            getId={(screen) => screen.id}
            getLabel={(screen) => describeScreen(screen)}
            isReordering={isReorderingScreens}
            onReorder={handleReorderScreens}
            renderItem={(screen) => (
              <Link
                to={`/admin/content/lessons/${lessonId}/screens/${screen.id}`}
                className="content-lesson-detail__screen-link"
              >
                <span className="content-lesson-detail__screen-type">{screen.type}</span>
                <span className="content-lesson-detail__screen-summary">
                  {describeScreen(screen)}
                </span>
              </Link>
            )}
          />
        ) : (
          <ul className="content-lesson-detail__screen-list">
            {sortedScreens.map((screen) => (
              <li key={screen.id}>
                <Link
                  to={`/admin/content/lessons/${lessonId}/screens/${screen.id}`}
                  className="content-lesson-detail__screen-link"
                >
                  <span className="content-lesson-detail__screen-type">{screen.type}</span>
                  <span className="content-lesson-detail__screen-summary">
                    {describeScreen(screen)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {isOwner ? (
          <Link
            to={`/admin/content/lessons/${lessonId}/screens/new`}
            className="content-lesson-detail__add-screen-link"
          >
            <Plus size={16} aria-hidden="true" />
            Add screen
          </Link>
        ) : null}
      </Card>

      <Card as="section" className="content-lesson-detail__section">
        <h2>Practice sets</h2>
        {practiceSets.length === 0 ? (
          <p className="content-lesson-detail__empty">No practice sets yet.</p>
        ) : (
          <ul className="content-lesson-detail__practice-set-list">
            {practiceSets.map((practiceSet) => (
              <li key={practiceSet.id}>
                <Link
                  to={`/admin/content/practice-sets/${practiceSet.id}`}
                  className="content-lesson-detail__practice-set-link"
                >
                  {practiceSet.title}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {isOwner ? (
          <>
            {practiceSetError ? (
              <p className="content-lesson-detail__banner" role="alert">
                {practiceSetError}
              </p>
            ) : null}
            <form
              className="content-lesson-detail__add-practice-set-form"
              onSubmit={handleAddPracticeSet}
            >
              <Input
                label="New practice set title"
                value={newPracticeSetTitle}
                onChange={(event) => setNewPracticeSetTitle(event.target.value)}
                required
                maxLength={200}
                disabled={isCreatingPracticeSet}
              />
              <Button type="submit" isLoading={isCreatingPracticeSet}>
                <Plus size={16} aria-hidden="true" />
                Add practice set
              </Button>
            </form>
          </>
        ) : null}
      </Card>

      {isOwner ? (
        <Card
          as="section"
          className="content-lesson-detail__section content-lesson-detail__danger"
        >
          <h2>Danger zone</h2>
          {deleteError ? (
            <p className="content-lesson-detail__banner" role="alert">
              {deleteError}
            </p>
          ) : null}
          <p className="content-lesson-detail__danger-copy">
            Deleting this lesson also deletes every screen inside it.
          </p>
          <Button
            type="button"
            variant="destructive"
            isLoading={isProbingDelete}
            onClick={handleDeleteClick}
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete lesson
          </Button>
        </Card>
      ) : null}

      <ConfirmDeleteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmDelete}
        resourceName={lesson.title}
        resourceLabel="lesson"
        warningText={deleteWarning}
        isDeleting={isDeleting}
      />
    </main>
  );
}
