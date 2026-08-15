import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate, Navigate, Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { chapterService } from "../services/chapter.service.js";
import { lessonService } from "../services/lesson.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Button } from "../components/ui/Button.jsx";
import { ConfirmDeleteModal } from "../components/ui/ConfirmDeleteModal.jsx";
import { ReorderableList } from "../components/content/ReorderableList.jsx";
import "./ContentChapterDetailPage.css";

// Phase 9 (Milestone 2). There's no GET /chapters/:id endpoint, so this page can't recover a
// chapter's own metadata from a bare refresh/deep-link -- it needs courseId, handed over via
// router link state from ContentCourseDetailPage's chapter links, to fetch the parent course
// (which already embeds its chapters) and derive this one from that list. A direct navigation
// with no state redirects back to the course list rather than guessing -- a real, accepted gap,
// not worth a new backend endpoint for.
export function ContentChapterDetailPage() {
  const { chapterId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const courseIdFromState = location.state?.courseId;

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [isCreatingLesson, setIsCreatingLesson] = useState(false);
  const [lessonError, setLessonError] = useState(null);
  const [isReorderingLessons, setIsReorderingLessons] = useState(false);

  const [isProbingDelete, setIsProbingDelete] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    if (!courseIdFromState) return;
    let cancelled = false;
    setError(null);
    setCourse(null);
    setLessons(null);

    async function load() {
      try {
        const [courseResult, lessonsResult] = await Promise.all([
          courseService.getById(courseIdFromState),
          lessonService.listForChapter(chapterId),
        ]);
        if (cancelled) return;
        const chapter = courseResult.chapters.find((c) => String(c.id) === chapterId);
        if (!chapter) {
          setError("Chapter not found.");
          return;
        }
        setCourse(courseResult);
        setLessons(lessonsResult.lessons);
        setTitle(chapter.title);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [chapterId, courseIdFromState, loadAttempt]);

  if (!courseIdFromState) {
    return <Navigate to="/admin/content" replace />;
  }

  async function handleSaveSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);
    try {
      const updated = await chapterService.update(chapterId, { title });
      setCourse((current) => ({
        ...current,
        chapters: current.chapters.map((c) => (c.id === updated.id ? updated : c)),
      }));
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(parseApiError(err).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddLesson(event) {
    event.preventDefault();
    setLessonError(null);
    setIsCreatingLesson(true);
    try {
      const lesson = await lessonService.create(chapterId, { title: newLessonTitle });
      setLessons((current) => [...current, lesson]);
      setNewLessonTitle("");
    } catch (err) {
      setLessonError(parseApiError(err).message);
    } finally {
      setIsCreatingLesson(false);
    }
  }

  async function handleReorderLessons(orderedIds) {
    setLessonError(null);
    setIsReorderingLessons(true);
    try {
      await lessonService.reorder(chapterId, orderedIds);
      // Same reasoning as ContentCourseDetailPage's chapter reorder handler -- keep the local
      // order_index values in sync with what actually persisted, so a later create/delete
      // recomputing sortedLessons doesn't silently revert to the pre-reorder order.
      setLessons((current) =>
        current.map((lesson) => ({
          ...lesson,
          order_index: orderedIds.indexOf(lesson.id) + 1,
        }))
      );
    } catch (err) {
      setLessonError(parseApiError(err).message);
      throw err;
    } finally {
      setIsReorderingLessons(false);
    }
  }

  async function handleDeleteClick() {
    setDeleteError(null);
    setIsProbingDelete(true);
    try {
      await chapterService.remove(chapterId);
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
      await chapterService.remove(chapterId, { confirm: true });
      navigate(`/admin/content/courses/${courseIdFromState}`);
    } catch (err) {
      setDeleteError(parseApiError(err).message);
      setIsModalOpen(false);
      setIsDeleting(false);
    }
  }

  if (error) {
    return (
      <main className="content-chapter-detail">
        <p className="content-chapter-detail__banner" role="alert">
          {error}
        </p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
      </main>
    );
  }

  if (course === null || lessons === null) {
    return (
      <main className="content-chapter-detail">
        <p className="content-chapter-detail__empty">Loading&hellip;</p>
      </main>
    );
  }

  const chapter = course.chapters.find((c) => String(c.id) === chapterId);
  const isOwner = course.created_by_id === user.id || user.role === "admin";
  const sortedLessons = [...lessons].sort((a, b) => a.order_index - b.order_index);

  return (
    <main className="content-chapter-detail">
      <Link
        to={`/admin/content/courses/${course.id}`}
        className="content-chapter-detail__back"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {course.title}
      </Link>

      <Card as="section" className="content-chapter-detail__section">
        <h1>{chapter.title}</h1>
        {!isOwner ? (
          <p className="content-chapter-detail__readonly-note">
            You don&rsquo;t own this course, so it&rsquo;s read-only for you here.
          </p>
        ) : (
          <>
            {saveError ? (
              <p className="content-chapter-detail__banner" role="alert">
                {saveError}
              </p>
            ) : null}
            {saveSuccess ? (
              <p
                className="content-chapter-detail__banner content-chapter-detail__banner--success"
                role="status"
              >
                Saved.
              </p>
            ) : null}
            <form className="content-chapter-detail__save-form" onSubmit={handleSaveSubmit}>
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

      <Card as="section" className="content-chapter-detail__section">
        <h2>Lessons</h2>
        {sortedLessons.length === 0 ? (
          <p className="content-chapter-detail__empty">No lessons yet.</p>
        ) : isOwner ? (
          <ReorderableList
            items={sortedLessons}
            getId={(lesson) => lesson.id}
            getLabel={(lesson) => lesson.title}
            isReordering={isReorderingLessons}
            onReorder={handleReorderLessons}
            renderItem={(lesson) => (
              <div className="content-chapter-detail__lesson-row">{lesson.title}</div>
            )}
          />
        ) : (
          <ul className="content-chapter-detail__lesson-list">
            {sortedLessons.map((lesson) => (
              <li key={lesson.id} className="content-chapter-detail__lesson-row">
                {lesson.title}
              </li>
            ))}
          </ul>
        )}

        {isOwner ? (
          <>
            {lessonError ? (
              <p className="content-chapter-detail__banner" role="alert">
                {lessonError}
              </p>
            ) : null}
            <form className="content-chapter-detail__add-lesson-form" onSubmit={handleAddLesson}>
              <Input
                label="New lesson title"
                value={newLessonTitle}
                onChange={(event) => setNewLessonTitle(event.target.value)}
                required
                maxLength={200}
                disabled={isCreatingLesson}
              />
              <Button type="submit" isLoading={isCreatingLesson}>
                <Plus size={16} aria-hidden="true" />
                Add lesson
              </Button>
            </form>
          </>
        ) : null}
      </Card>

      {isOwner ? (
        <Card
          as="section"
          className="content-chapter-detail__section content-chapter-detail__danger"
        >
          <h2>Danger zone</h2>
          {deleteError ? (
            <p className="content-chapter-detail__banner" role="alert">
              {deleteError}
            </p>
          ) : null}
          <p className="content-chapter-detail__danger-copy">
            Deleting this chapter also deletes every lesson and screen inside it.
          </p>
          <Button
            type="button"
            variant="destructive"
            isLoading={isProbingDelete}
            onClick={handleDeleteClick}
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete chapter
          </Button>
        </Card>
      ) : null}

      <ConfirmDeleteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmDelete}
        resourceName={chapter.title}
        resourceLabel="chapter"
        warningText={deleteWarning}
        isDeleting={isDeleting}
      />
    </main>
  );
}
