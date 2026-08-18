import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Layers, BookOpen, Lock } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { lessonService } from "../services/lesson.service.js";
import { progressService } from "../services/progress.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Button } from "../components/ui/Button.jsx";
import { Card } from "../components/ui/Card.jsx";
import { XpStreakBadge } from "../components/ui/XpStreakBadge.jsx";
import { getCourseIcon } from "../components/ui/CourseIcons.jsx";
import "./CourseDetailPage.css";

const SKELETON_CHAPTER_COUNT = 6;

export function CourseDetailPage() {
  const { courseId } = useParams();
  const { isAuthenticated, isLoading: authIsLoading } = useAuth();
  const [course, setCourse] = useState(null);
  const [lessonsByChapterId, setLessonsByChapterId] = useState({});
  const [progress, setProgress] = useState(null);
  const [expandedChapterIds, setExpandedChapterIds] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Phase 5.5: this page is now public (reachable with no session), so the effect waits for auth
  // state to resolve before deciding whether to also fetch progress -- calling it while
  // genuinely anonymous would just be a request that's certain to 401, and firing it before
  // isAuthenticated is known could momentarily fetch as anonymous for a user who turns out to be
  // logged in.
  useEffect(() => {
    if (authIsLoading) return;
    let cancelled = false;
    setError(null);
    setCourse(null);
    setProgress(null);

    async function load() {
      try {
        const courseResult = await courseService.getById(courseId);
        if (cancelled) return;

        // Eager, parallel -- GET /courses/:id only returns shallow chapters (no nested lessons),
        // but at today's real scale (6 chapters, 3-5 lessons each, verified against the actual
        // seeded data) fetching every chapter's lessons up front is cheap and keeps expand/collapse
        // pure UI state afterward, with no per-chapter loading/error tracking to build or test.
        const lessonResults = await Promise.all(
          courseResult.chapters.map((chapter) => lessonService.listForChapter(chapter.id))
        );
        if (cancelled) return;

        setCourse(courseResult);
        setLessonsByChapterId(
          Object.fromEntries(
            courseResult.chapters.map((chapter, index) => [
              chapter.id,
              lessonResults[index].lessons,
            ])
          )
        );
        // All chapters start expanded -- the syllabus itself is the point of this page (doubly so
        // for an anonymous visitor deciding whether to sign up), so showing the full contents
        // immediately reads better than making every visitor click through six disclosures one at
        // a time. "Collapse all" (the same toggle, just starting in its other state) is still the
        // escape hatch for a long course once a visitor wants a scannable overview again.
        setExpandedChapterIds(new Set(courseResult.chapters.map((chapter) => chapter.id)));
      } catch (err) {
        if (!cancelled) setError(parseApiError(err));
        return;
      }

      // A learner with no Progress row yet for this course (never started it) is not an error --
      // GET /progress simply returns an empty array, same "no row yet" shape used everywhere else
      // Progress is read. Not wrapped in the same try/catch as the course fetch above: a failed
      // progress fetch shouldn't blank a page that otherwise loaded fine, matching Course
      // Catalog's own independent-fetch reasoning.
      if (isAuthenticated) {
        try {
          const progressResult = await progressService.listForUser({
            userId: "me",
            courseId: Number(courseId),
          });
          if (!cancelled) setProgress(progressResult.progress[0] ?? null);
        } catch {
          // Silently degrade -- the course content itself already rendered; the progress strip
          // just doesn't appear until the next successful load.
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [courseId, loadAttempt, isAuthenticated, authIsLoading]);

  function toggleChapter(chapterId) {
    setExpandedChapterIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }

  // Multi-expand independently toggling 6 chapters genuinely invites opening all of them at once
  // (critique-confirmed live: 25 lesson links in one continuous scroll, no way back to a scannable
  // view except closing each of the 6 one at a time) -- this is the documented escape hatch for
  // that exact state, not a generic utility added speculatively.
  const allExpanded =
    course !== null &&
    course.chapters.length > 0 &&
    expandedChapterIds.size === course.chapters.length;

  function toggleAllChapters() {
    setExpandedChapterIds(
      allExpanded ? new Set() : new Set(course.chapters.map((chapter) => chapter.id))
    );
  }

  if (error) {
    // A genuinely nonexistent course (bad/stale URL) can't be fixed by retrying -- point back to
    // the catalog instead of offering a retry button that would just fail the same way again.
    if (error.code === "NOT_FOUND") {
      return (
        <main className="course-detail">
          <p className="course-detail__not-found">{error.message}</p>
          <Link to="/courses" className="button button--primary">
            Back to courses
          </Link>
        </main>
      );
    }
    return (
      <main className="course-detail">
        <p className="course-detail__banner" role="alert">
          {error.message}
        </p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
      </main>
    );
  }

  const CourseIcon = course ? getCourseIcon(course.title) : null;
  const totalLessons = course
    ? course.chapters.reduce(
        (sum, chapter) => sum + (lessonsByChapterId[chapter.id]?.length ?? 0),
        0
      )
    : 0;

  return (
    <main className="course-detail">
      <Link to="/courses" className="course-detail__back">
        ← Back to courses
      </Link>
      {authIsLoading || course === null ? (
        <CourseDetailSkeleton />
      ) : (
        <>
          <div className="course-detail__hero">
            <div className="course-detail__hero-pattern" aria-hidden="true" />
            <div className="course-detail__hero-icon-chip">
              <CourseIcon className="course-detail__hero-icon" />
            </div>
            <div className="course-detail__hero-content">
              <h1>{course.title}</h1>
              {course.narrative ? (
                <p className="course-detail__narrative">{course.narrative}</p>
              ) : null}
              <div className="course-detail__hero-stats">
                <span className="course-detail__hero-stat">
                  <Layers size={16} aria-hidden="true" />
                  {course.chapters.length} {course.chapters.length === 1 ? "chapter" : "chapters"}
                </span>
                <span className="course-detail__hero-stat">
                  <BookOpen size={16} aria-hidden="true" />
                  {totalLessons} {totalLessons === 1 ? "lesson" : "lessons"}
                </span>
              </div>
            </div>
          </div>

          {isAuthenticated && progress ? (
            <div className="course-detail__progress-strip">
              {progress.completed_at ? (
                <span className="course-detail__progress-completed">Completed</span>
              ) : (
                <XpStreakBadge xp={progress.xp} streak={progress.current_streak} />
              )}
            </div>
          ) : null}

          {!authIsLoading && !isAuthenticated ? (
            <Card className="course-detail__signup-cta">
              <div className="course-detail__signup-cta-text">
                <Lock size={20} aria-hidden="true" className="course-detail__signup-cta-icon" />
                <div>
                  <p className="course-detail__signup-cta-title">Start this course for free</p>
                  <p className="course-detail__signup-cta-subtitle">
                    Sign up to unlock every lesson and track your progress as you go.
                  </p>
                </div>
              </div>
              <Link to="/signup" className="button button--primary">
                Sign up free
              </Link>
            </Card>
          ) : null}

          {course.chapters.length === 0 ? (
            <p className="course-detail__empty">
              This course doesn&rsquo;t have any chapters yet — check back soon.
            </p>
          ) : (
            <>
              {course.chapters.length > 1 ? (
                <button
                  type="button"
                  className="course-detail__toggle-all"
                  onClick={toggleAllChapters}
                >
                  {allExpanded ? "Collapse all" : "Expand all"}
                </button>
              ) : null}
              <ul className="course-detail__chapters">
                {course.chapters.map((chapter, index) => (
                  <ChapterAccordionItem
                    key={chapter.id}
                    chapter={chapter}
                    index={index}
                    lessons={lessonsByChapterId[chapter.id] ?? []}
                    isExpanded={expandedChapterIds.has(chapter.id)}
                    onToggle={() => toggleChapter(chapter.id)}
                    isAuthenticated={isAuthenticated}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}

function ChapterAccordionItem({ chapter, index, lessons, isExpanded, onToggle, isAuthenticated }) {
  const lessonListId = `chapter-${chapter.id}-lessons`;

  return (
    <li className="course-detail__chapter" style={{ "--chapter-index": index }}>
      {/* The heading wraps the trigger button (not the reverse) -- the WAI-ARIA disclosure/accordion
          pattern's recommended structure. A screen-reader user can now jump chapter-to-chapter by
          heading navigation; previously the title was a plain <span> and the page had exactly one
          heading (h1) with nothing below it. Visual weight is unchanged: the button's own
          font-weight/size rules already override whatever this h2 would otherwise cascade down. */}
      <h2 className="course-detail__chapter-heading">
        {/* Critique fix: with no aria-label, JSX's own whitespace-stripping between these three
            <span>s left the accessible name as one run-on string with no word boundaries
            ("...Physically3 lessons") -- a screen reader announced number/letter seams instead of
            a scannable name. Explicit aria-label gives back "Chapter N: Title, X lessons",
            matching the pattern already used for CourseCatalogPage's card links. */}
        <button
          type="button"
          className="course-detail__chapter-header"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={lessonListId}
          aria-label={`Chapter ${index + 1}: ${chapter.title}, ${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`}
        >
          <ChevronRight size={18} aria-hidden="true" className="course-detail__chapter-chevron" />
          <span className="course-detail__chapter-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="course-detail__chapter-title">{chapter.title}</span>
          <span className="course-detail__chapter-count">
            {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
          </span>
        </button>
      </h2>
      {isExpanded ? (
        <ul id={lessonListId} className="course-detail__lessons">
          {lessons.map((lesson) =>
            isAuthenticated ? (
              <li key={lesson.id}>
                <Link to={`/lessons/${lesson.id}`} className="course-detail__lesson">
                  {lesson.title}
                </Link>
              </li>
            ) : (
              // Anonymous visitor: the syllabus (this title) is the free preview -- the lesson
              // itself stays behind signup, so this renders as inert text, not a link that would
              // just bounce through ProtectedRoute to /login with no context for why.
              <li key={lesson.id}>
                <span className="course-detail__lesson course-detail__lesson--locked">
                  {lesson.title}
                  <Lock size={14} aria-hidden="true" className="course-detail__lesson-lock" />
                </span>
              </li>
            )
          )}
        </ul>
      ) : null}
    </li>
  );
}

function CourseDetailSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="course-detail__skeleton-line course-detail__skeleton-line--title" />
      <div className="course-detail__skeleton-line" />
      <div className="course-detail__skeleton-line course-detail__skeleton-line--short" />
      <ul className="course-detail__chapters">
        {Array.from({ length: SKELETON_CHAPTER_COUNT }, (_, index) => (
          <li key={index} className="course-detail__chapter course-detail__chapter--skeleton">
            <div className="course-detail__skeleton-line course-detail__skeleton-line--chapter" />
          </li>
        ))}
      </ul>
    </div>
  );
}
