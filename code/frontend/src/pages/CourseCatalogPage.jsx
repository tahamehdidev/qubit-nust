import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, Gauge, Lock, Zap } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { progressService } from "../services/progress.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Button } from "../components/ui/Button.jsx";
import { XpStreakBadge } from "../components/ui/XpStreakBadge.jsx";
import { getCourseIcon } from "../components/ui/CourseIcons.jsx";
import "./CourseCatalogPage.css";

// 3 skeleton placeholders regardless of the real course count -- there's no way to know how many
// are coming before the first response, and 3 happens to match today's real catalog size anyway.
const SKELETON_COUNT = 3;

// Conservative for the grid's own narrowest card width (280px, the grid's minmax floor) at
// --text-base/16px -- deliberately well under what 3 lines could hold even there, so the CSS
// line-clamp below (kept as a defensive safety net, not the primary truncation mechanism) is
// never actually forced to cut mid-word in practice. Confirmed live against all 3 real seeded
// narratives: the previous CSS-only clamp cut off mid-word ("...superconducting mi", "...trainable
// mode", "...specific proble") on every one of them, at both desktop and mobile widths.
const NARRATIVE_CHAR_BUDGET = 110;

export function truncateAtWordBoundary(text, maxLength) {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`;
}

export function CourseCatalogPage() {
  const { isAuthenticated, isLoading: authIsLoading } = useAuth();
  const [courses, setCourses] = useState(null);
  const [progressByCourseId, setProgressByCourseId] = useState({});
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    // Courses and progress are fetched independently, not via Promise.all -- courses is the
    // actual task (browse and pick one), progress is a secondary enhancement (the XP/streak
    // status slot). A dual-agent critique found the coupled version failed the whole screen,
    // full-page error and all, over a non-critical progress-service hiccup that had nothing to
    // do with the learner's ability to browse and pick a course. A failed progress fetch now
    // just leaves every card reading "Not started" instead of blanking the catalog entirely.
    async function load() {
      try {
        const coursesResult = await courseService.list();
        if (cancelled) return;
        setCourses(coursesResult.courses);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
        return;
      }

      try {
        const progressResult = await progressService.listForUser({ userId: "me" });
        if (cancelled) return;
        setProgressByCourseId(
          Object.fromEntries(progressResult.progress.map((entry) => [entry.course_id, entry]))
        );
      } catch {
        // Silently degrade -- the catalog itself already rendered above; every card just reads
        // "Not started" rather than reflecting real progress until the next successful load.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  if (error) {
    return (
      <main className="course-catalog">
        <h1>Course Catalog</h1>
        <p className="course-catalog__banner" role="alert">
          {error}
        </p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
      </main>
    );
  }

  if (courses !== null && courses.length === 0) {
    return (
      <main className="course-catalog">
        <h1>Course Catalog</h1>
        <p className="course-catalog__empty">No courses are available yet — check back soon.</p>
      </main>
    );
  }

  const progressEntries = Object.values(progressByCourseId);
  const totalXp = progressEntries.reduce((sum, entry) => sum + entry.xp, 0);
  const inProgressCount = progressEntries.filter((entry) => !entry.completed_at).length;

  return (
    <main className="course-catalog">
      <div className="course-catalog__hero">
        <div className="course-catalog__hero-pattern" aria-hidden="true" />
        <div className="course-catalog__hero-content">
          <h1>Course Catalog</h1>
          <p className="course-catalog__intro">
            Three courses, each built around one real question in quantum computing — pick where you
            want to start.
          </p>
          {courses !== null ? (
            <div className="course-catalog__hero-stats">
              <span className="course-catalog__hero-stat">
                <BookOpen size={16} aria-hidden="true" />
                {courses.length} {courses.length === 1 ? "course" : "courses"}
              </span>
              {isAuthenticated && inProgressCount > 0 ? (
                <span className="course-catalog__hero-stat">
                  <Gauge size={16} aria-hidden="true" />
                  {inProgressCount} in progress
                </span>
              ) : null}
              {isAuthenticated && totalXp > 0 ? (
                <span className="course-catalog__hero-stat">
                  <Zap size={16} aria-hidden="true" />
                  {totalXp} XP earned
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {!authIsLoading && !isAuthenticated ? (
        <Card className="course-catalog__signup-cta">
          <div className="course-catalog__signup-cta-text">
            <Lock size={20} aria-hidden="true" className="course-catalog__signup-cta-icon" />
            <div>
              <p className="course-catalog__signup-cta-title">Track your progress as you learn</p>
              <p className="course-catalog__signup-cta-subtitle">
                Sign up free to earn XP, build a streak, and pick up where you left off.
              </p>
            </div>
          </div>
          <Link to="/signup" className="button button--primary">
            Sign up free
          </Link>
        </Card>
      ) : null}

      <div className="course-catalog__grid">
        {courses === null
          ? Array.from({ length: SKELETON_COUNT }, (_, index) => <CourseCardSkeleton key={index} />)
          : courses.map((course, index) => (
              <CourseCard
                key={course.id}
                course={course}
                index={index}
                progress={progressByCourseId[course.id] ?? null}
              />
            ))}
      </div>
    </main>
  );
}

function CourseCard({ course, index, progress }) {
  // Progress.completed_at is a real, correct-to-check-for column, but no code anywhere in this
  // codebase ever sets it yet (course-completion detection is unspecified, out of scope for
  // every milestone built so far -- same honest framing as dashboard.service.js's
  // getCompletionStats()). This branch is correctly wired but currently unreachable: it will
  // start rendering the moment a future milestone adds that logic, not before.
  const isCompleted = Boolean(progress?.completed_at);
  // A returning learner scanning fast (critique's "Alex" persona) had to read all 3 status
  // slots to find the one to re-enter -- the badge alone didn't make the in-progress card pop
  // before reading it. A subtle accent border does, without touching the status-representation
  // redesign itself (deferred separately): full border-color change, not a side-stripe (banned).
  const isInProgress = Boolean(progress) && !isCompleted;
  // Dual-agent critique finding: with no aria-label, the anchor's accessible name was every
  // descendant text node concatenated with no separation -- title, full narrative, and status
  // running together as one undifferentiated block for a screen-reader user navigating by link.
  // This gives back a scannable "title -- status" name instead, matching what a sighted user
  // actually parses at a glance.
  const statusLabel = isCompleted
    ? "Completed"
    : progress
      ? `In progress, ${progress.xp} XP`
      : "Not started";
  const ctaLabel = isCompleted ? "Review course" : progress ? "Continue" : "Start course";
  const CourseIcon = getCourseIcon(course.title);

  return (
    <Link
      to={`/courses/${course.id}`}
      className="course-catalog__card-link"
      aria-label={`${course.title} — ${statusLabel}`}
      style={{ "--card-index": index }}
    >
      <Card
        className={
          "course-catalog__card" + (isInProgress ? " course-catalog__card--in-progress" : "")
        }
      >
        <div className="course-catalog__icon-chip">
          <CourseIcon className="course-catalog__icon" />
        </div>
        <h2>{course.title}</h2>
        {course.narrative ? (
          <p className="course-catalog__narrative">
            {truncateAtWordBoundary(course.narrative, NARRATIVE_CHAR_BUDGET)}
          </p>
        ) : null}
        <div className="course-catalog__status">
          {isCompleted ? (
            <span className="course-catalog__completed">Completed</span>
          ) : progress ? (
            <XpStreakBadge xp={progress.xp} streak={progress.current_streak} />
          ) : (
            <span className="course-catalog__not-started">Not started</span>
          )}
          <span className="course-catalog__cta">
            {ctaLabel}
            <ChevronRight size={16} aria-hidden="true" />
          </span>
        </div>
      </Card>
    </Link>
  );
}

function CourseCardSkeleton() {
  return (
    <div className="course-catalog__card course-catalog__card--skeleton" aria-hidden="true">
      <div className="course-catalog__skeleton-chip" />
      <div className="course-catalog__skeleton-line course-catalog__skeleton-line--title" />
      <div className="course-catalog__skeleton-line" />
      <div className="course-catalog__skeleton-line" />
      <div className="course-catalog__skeleton-line course-catalog__skeleton-line--short" />
    </div>
  );
}
