import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { chapterService } from "../services/chapter.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Button } from "../components/ui/Button.jsx";
import { ConfirmDeleteModal } from "../components/ui/ConfirmDeleteModal.jsx";
import { ReorderableList } from "../components/content/ReorderableList.jsx";
import "./ContentCourseDetailPage.css";

// Phase 9 (Milestone 1). Read access is open to any authenticated user (GET /courses/:id is
// public even), but write affordances (rename, add/delete chapter, delete course) only render
// for the owning instructor or an admin -- the backend would reject the write anyway, so hiding
// the control here is a UX courtesy, not the real access boundary.
export function ContentCourseDetailPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [course, setCourse] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [title, setTitle] = useState("");
  const [narrative, setNarrative] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const [chapterError, setChapterError] = useState(null);
  const [isReorderingChapters, setIsReorderingChapters] = useState(false);

  // The unconfirmed DELETE call is the only way to learn the cascade counts (the 400 body's
  // message IS the cascade-count sentence, per 02-api-contract.md §3.5) -- there's no separate
  // preview endpoint, so "probing" is a real request, not a client-side guess.
  const [isProbingDelete, setIsProbingDelete] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCourse(null);

    async function load() {
      try {
        const result = await courseService.getById(courseId);
        if (cancelled) return;
        setCourse(result);
        setTitle(result.title);
        setNarrative(result.narrative ?? "");
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [courseId, loadAttempt]);

  async function handleSaveSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);
    try {
      const updated = await courseService.update(courseId, {
        title,
        narrative: narrative || undefined,
      });
      setCourse((current) => ({ ...current, ...updated }));
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(parseApiError(err).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddChapter(event) {
    event.preventDefault();
    setChapterError(null);
    setIsCreatingChapter(true);
    try {
      const chapter = await chapterService.create(courseId, { title: newChapterTitle });
      setCourse((current) => ({ ...current, chapters: [...current.chapters, chapter] }));
      setNewChapterTitle("");
    } catch (err) {
      setChapterError(parseApiError(err).message);
    } finally {
      setIsCreatingChapter(false);
    }
  }

  // Passed to ReorderableList as `onReorder` -- it owns error presentation (the shared
  // content-course-detail__banner slot) and re-throws so the list knows to revert its optimistic
  // local order when the server call fails.
  async function handleReorderChapters(orderedIds) {
    setChapterError(null);
    setIsReorderingChapters(true);
    try {
      await chapterService.reorder(courseId, orderedIds);
      // Keeps this page's own order_index values in sync with what the server actually saved --
      // ReorderableList manages its own display order independently, but this page's sortedChapters
      // still derives from course.chapters, so a later create/delete recomputing that sort must see
      // the real, current order rather than silently reverting to the pre-reorder one.
      setCourse((current) => ({
        ...current,
        chapters: current.chapters.map((chapter) => ({
          ...chapter,
          order_index: orderedIds.indexOf(chapter.id) + 1,
        })),
      }));
    } catch (err) {
      setChapterError(parseApiError(err).message);
      throw err;
    } finally {
      setIsReorderingChapters(false);
    }
  }

  async function handleDeleteClick() {
    setDeleteError(null);
    setIsProbingDelete(true);
    try {
      // Deliberately unconfirmed -- always rejected with a 400 whose message states the cascade
      // counts, which becomes the modal's warning text. Nothing is actually deleted by this call.
      await courseService.remove(courseId);
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
      await courseService.remove(courseId, { confirm: true });
      navigate("/admin/content");
    } catch (err) {
      setDeleteError(parseApiError(err).message);
      setIsModalOpen(false);
      setIsDeleting(false);
    }
  }

  if (error) {
    return (
      <main className="content-course-detail">
        <p className="content-course-detail__banner" role="alert">
          {error}
        </p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
      </main>
    );
  }

  if (course === null) {
    return (
      <main className="content-course-detail">
        <p className="content-course-detail__empty">Loading&hellip;</p>
      </main>
    );
  }

  const isOwner = course.created_by_id === user.id || user.role === "admin";
  const sortedChapters = [...course.chapters].sort((a, b) => a.order_index - b.order_index);

  return (
    <main className="content-course-detail">
      <Link to="/admin/content" className="content-course-detail__back">
        <ArrowLeft size={16} aria-hidden="true" />
        All courses
      </Link>

      <Card as="section" className="content-course-detail__section">
        <h1>{course.title}</h1>
        {!isOwner ? (
          <p className="content-course-detail__readonly-note">
            You don&rsquo;t own this course, so it&rsquo;s read-only for you here.
          </p>
        ) : (
          <>
            {saveError ? (
              <p className="content-course-detail__banner" role="alert">
                {saveError}
              </p>
            ) : null}
            {saveSuccess ? (
              <p
                className="content-course-detail__banner content-course-detail__banner--success"
                role="status"
              >
                Saved.
              </p>
            ) : null}
            <form className="content-course-detail__save-form" onSubmit={handleSaveSubmit}>
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
              <label className="field" htmlFor="content-course-detail-narrative">
                <span className="field__label">Narrative</span>
                <textarea
                  id="content-course-detail-narrative"
                  className="field__control content-course-detail__narrative-textarea"
                  value={narrative}
                  onChange={(event) => {
                    setNarrative(event.target.value);
                    setSaveSuccess(false);
                  }}
                  disabled={isSaving}
                />
              </label>
              <Button type="submit" isLoading={isSaving}>
                Save
              </Button>
            </form>
          </>
        )}
      </Card>

      <Card as="section" className="content-course-detail__section">
        <h2>Chapters</h2>
        {sortedChapters.length === 0 ? (
          <p className="content-course-detail__empty">No chapters yet.</p>
        ) : isOwner ? (
          <ReorderableList
            items={sortedChapters}
            getId={(chapter) => chapter.id}
            getLabel={(chapter) => chapter.title}
            isReordering={isReorderingChapters}
            onReorder={handleReorderChapters}
            renderItem={(chapter) => (
              <Link
                to={`/admin/content/chapters/${chapter.id}`}
                state={{ courseId: course.id, courseTitle: course.title }}
                className="content-course-detail__chapter-link"
              >
                <span className="content-course-detail__chapter-title">{chapter.title}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            )}
          />
        ) : (
          // Non-owner: a plain read-only list -- reordering requires ownership server-side too,
          // so there's no point offering drag/move controls that would just 403.
          <ul className="content-course-detail__chapter-list">
            {sortedChapters.map((chapter) => (
              <li key={chapter.id}>
                <Link
                  to={`/admin/content/chapters/${chapter.id}`}
                  state={{ courseId: course.id, courseTitle: course.title }}
                  className="content-course-detail__chapter-link"
                >
                  <span className="content-course-detail__chapter-title">{chapter.title}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {isOwner ? (
          <>
            {chapterError ? (
              <p className="content-course-detail__banner" role="alert">
                {chapterError}
              </p>
            ) : null}
            <form className="content-course-detail__add-chapter-form" onSubmit={handleAddChapter}>
              <Input
                label="New chapter title"
                value={newChapterTitle}
                onChange={(event) => setNewChapterTitle(event.target.value)}
                required
                maxLength={200}
                disabled={isCreatingChapter}
              />
              <Button type="submit" isLoading={isCreatingChapter}>
                <Plus size={16} aria-hidden="true" />
                Add chapter
              </Button>
            </form>
          </>
        ) : null}
      </Card>

      {isOwner ? (
        <Card as="section" className="content-course-detail__section content-course-detail__danger">
          <h2>Danger zone</h2>
          {deleteError ? (
            <p className="content-course-detail__banner" role="alert">
              {deleteError}
            </p>
          ) : null}
          <p className="content-course-detail__danger-copy">
            Deleting this course also deletes every chapter, lesson, and screen inside it.
          </p>
          <Button
            type="button"
            variant="destructive"
            isLoading={isProbingDelete}
            onClick={handleDeleteClick}
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete course
          </Button>
        </Card>
      ) : null}

      <ConfirmDeleteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmDelete}
        resourceName={course.title}
        resourceLabel="course"
        warningText={deleteWarning}
        isDeleting={isDeleting}
      />
    </main>
  );
}
