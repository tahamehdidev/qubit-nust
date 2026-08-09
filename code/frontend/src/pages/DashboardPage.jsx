import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ChevronRight,
  Flame,
  Zap,
  Users,
  Gauge,
  ShieldCheck,
  UserPlus,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { progressService } from "../services/progress.service.js";
import { cohortService } from "../services/cohort.service.js";
import { dashboardService } from "../services/dashboard.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Button } from "../components/ui/Button.jsx";
import { ProgressBar } from "../components/ui/ProgressBar.jsx";
import { XpStreakBadge } from "../components/ui/XpStreakBadge.jsx";
import { getCourseIcon } from "../components/ui/CourseIcons.jsx";
import "./DashboardPage.css";

// Role-branches once, at the top, into three components that share nothing beyond page chrome --
// there's no step-through/gating logic here at all (this is a read-only reporting screen, not a
// lesson/practice-set interaction), so none of the branches need anything from those two pages.
//
// Bug fix: admin used to fall into the same branch as instructor, which immediately calls
// cohortService.list() -- but GET /cohorts is backend-restricted to role "instructor" specifically
// (cohort.routes.js's own listCohortsController route, "no admin variant is documented for this
// route" per 02-api-contract.md §6.2), not "instructor or admin" like every other cohort route.
// An admin account hit a hard 403 error banner on this page, every single time, never even
// reaching InstructorDashboard's own empty-cohorts state -- a real functional bug, not just a
// cosmetic one. Admin gets its own branch now, which never calls that endpoint at all.
export function DashboardPage() {
  const { user } = useAuth();
  if (user.role === "learner") return <LearnerDashboard />;
  if (user.role === "admin") return <AdminDashboard />;
  return <InstructorDashboard />;
}

// Both role branches hit an identical top-level error banner and initial skeleton -- shared here
// since both copies exist in this same file (not a cross-screen "maybe a third one shows up"
// case like Lesson Player/Practice Set's step-through logic), so there's no speculative-reuse
// risk in extracting immediately.
function DashboardError({ message, onRetry }) {
  return (
    <main className="dashboard">
      <h1>Dashboard</h1>
      <p className="dashboard__banner" role="alert">
        {message}
      </p>
      <Button onClick={onRetry}>Try again</Button>
    </main>
  );
}

function DashboardSkeleton() {
  return (
    <main className="dashboard">
      <div aria-hidden="true" className="dashboard__skeleton">
        <div className="dashboard__skeleton-line dashboard__skeleton-line--title" />
        <div className="dashboard__skeleton-line" />
        <div className="dashboard__skeleton-line" />
      </div>
    </main>
  );
}

// Deliberately fetches nothing but GET /courses (public, safe for any role) -- cohort completion
// and pacing genuinely belong to whichever instructor owns each cohort, not to the admin account
// (see DashboardPage's own role-branch comment above), and there's no dedicated admin
// content-management UI in this app yet (the project plan's own explicit scope decision). Rather
// than pretend otherwise with fake data or a dead end, this states that plainly and points at the
// one thing an admin genuinely can do from here today: browse what's actually in the catalog.
function AdminDashboard() {
  const [courseCount, setCourseCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    courseService
      .list()
      .then(({ courses }) => {
        if (!cancelled) setCourseCount(courses.length);
      })
      .catch(() => {
        // Silently degrade -- the hero stat is a nice-to-have; the card below is the actual
        // content of this page and doesn't depend on it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="dashboard">
      <div className="dashboard__hero">
        <div className="dashboard__hero-pattern" aria-hidden="true" />
        <div className="dashboard__hero-content">
          <h1>Dashboard</h1>
          <p className="dashboard__hero-subtitle">Course oversight for admin accounts.</p>
          {courseCount !== null ? (
            <div className="dashboard__hero-stats">
              <span className="dashboard__hero-stat">
                <BookOpen size={16} aria-hidden="true" />
                {courseCount} {courseCount === 1 ? "course" : "courses"} in the catalog
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <Card className="dashboard__empty-cta">
        <div className="dashboard__empty-cta-text">
          <ShieldCheck size={20} aria-hidden="true" className="dashboard__empty-cta-icon" />
          <div>
            <p className="dashboard__empty-cta-title">Cohort reporting is scoped to instructors</p>
            <p className="dashboard__empty-cta-subtitle">
              Completion and pacing data belongs to whichever instructor owns each cohort, not the
              admin account &mdash; this isn&rsquo;t a sign anything is broken. Course, chapter,
              and lesson management happens directly through the API for now; there&rsquo;s no
              dedicated admin content UI yet.
            </p>
          </div>
        </div>
        <Link to="/courses" className="button button--primary">
          Browse courses
        </Link>
      </Card>

      {/* Phase 7C.1 -- the one thing this account genuinely can manage from the UI now. */}
      <Card className="dashboard__empty-cta">
        <div className="dashboard__empty-cta-text">
          <Users size={20} aria-hidden="true" className="dashboard__empty-cta-icon" />
          <div>
            <p className="dashboard__empty-cta-title">User management</p>
            <p className="dashboard__empty-cta-subtitle">
              Search accounts, deactivate one, or create a new instructor account.
            </p>
          </div>
        </div>
        <Link to="/admin/users" className="button button--primary">
          Manage users
        </Link>
      </Card>
    </main>
  );
}

function LearnerDashboard() {
  // Courses the learner has actually engaged with only -- this is "my progress so far", not a
  // second copy of Course Catalog's browse-everything grid. A course with no Progress row simply
  // doesn't appear here.
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Phase 8D: the join relationship POST /cohorts/join creates was write-only from the learner's
  // side -- no way to see which cohort(s) they'd joined, or leave one, short of an
  // instructor/admin removing them manually.
  const [cohorts, setCohorts] = useState([]);
  const [leavingCohortId, setLeavingCohortId] = useState(null);
  const [leaveError, setLeaveError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setEntries(null);

    async function load() {
      try {
        const [coursesResult, progressResult, cohortsResult] = await Promise.all([
          courseService.list(),
          progressService.listForUser({ userId: "me" }),
          cohortService.listMine(),
        ]);
        if (cancelled) return;
        const titleByCourseId = Object.fromEntries(
          coursesResult.courses.map((course) => [course.id, course.title])
        );
        setEntries(
          progressResult.progress.map((row) => ({
            ...row,
            courseTitle: titleByCourseId[row.course_id] ?? "Untitled course",
          }))
        );
        setCohorts(cohortsResult);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  async function handleLeaveCohort(cohortId) {
    setLeaveError(null);
    setLeavingCohortId(cohortId);
    try {
      await cohortService.leave(cohortId);
      setCohorts((current) => current.filter((entry) => entry.cohort_id !== cohortId));
    } catch (err) {
      setLeaveError(parseApiError(err).message);
    } finally {
      setLeavingCohortId(null);
    }
  }

  if (error) {
    return (
      <DashboardError message={error} onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
    );
  }

  if (entries === null) {
    return <DashboardSkeleton />;
  }

  const totalXp = entries.reduce((sum, entry) => sum + entry.xp, 0);
  const longestStreak = entries.reduce((max, entry) => Math.max(max, entry.current_streak), 0);

  return (
    <main className="dashboard">
      <div className="dashboard__hero">
        <div className="dashboard__hero-pattern" aria-hidden="true" />
        <div className="dashboard__hero-content">
          <h1>Dashboard</h1>
          <p className="dashboard__hero-subtitle">Your progress across every course you&rsquo;ve started.</p>
          {entries.length > 0 ? (
            <div className="dashboard__hero-stats">
              <span className="dashboard__hero-stat">
                <BookOpen size={16} aria-hidden="true" />
                {entries.length} {entries.length === 1 ? "course" : "courses"} started
              </span>
              <span className="dashboard__hero-stat">
                <Zap size={16} aria-hidden="true" />
                {totalXp} XP earned
              </span>
              {longestStreak > 0 ? (
                <span className="dashboard__hero-stat">
                  <Flame size={16} aria-hidden="true" />
                  {longestStreak}-day best streak
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {cohorts.length > 0 ? (
        <Card as="section" className="dashboard__cohorts">
          <h2 className="dashboard__cohorts-heading">
            <Users size={18} aria-hidden="true" />
            Your cohorts
          </h2>
          {leaveError ? (
            <p className="dashboard__banner" role="alert">
              {leaveError}
            </p>
          ) : null}
          <ul className="dashboard__cohorts-list">
            {cohorts.map((entry) => (
              <li key={entry.id} className="dashboard__cohorts-row">
                <span className="dashboard__cohorts-name">{entry.cohort_name}</span>
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={leavingCohortId === entry.cohort_id}
                  onClick={() => handleLeaveCohort(entry.cohort_id)}
                >
                  Leave
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {entries.length === 0 ? (
        <Card className="dashboard__empty-cta">
          <div className="dashboard__empty-cta-text">
            <BookOpen size={20} aria-hidden="true" className="dashboard__empty-cta-icon" />
            <div>
              <p className="dashboard__empty-cta-title">You haven&rsquo;t started any courses yet</p>
              <p className="dashboard__empty-cta-subtitle">
                Browse the catalog and pick one to start earning XP.
              </p>
            </div>
          </div>
          <Link to="/courses" className="button button--primary">
            Browse courses
          </Link>
        </Card>
      ) : (
        <ul className="dashboard__list">
          {entries.map((entry, index) => {
            // Same critique finding as Course Catalog's card-link: with no aria-label, the
            // anchor's accessible name is every descendant text node concatenated with no
            // separation (e.g. "Quantum Computing Hardware10 XP") -- this restores a scannable
            // "title -- status" name, matching CourseCatalogPage.jsx's own fix.
            const statusLabel = entry.completed_at
              ? "Completed"
              : `In progress, ${entry.xp} XP${
                  entry.current_streak > 0 ? `, ${entry.current_streak}-day streak` : ""
                }`;
            const ctaLabel = entry.completed_at ? "Review course" : "Continue";
            const CourseIcon = getCourseIcon(entry.courseTitle);
            return (
              <li key={entry.course_id} style={{ "--dashboard-row-index": index }}>
                <Link
                  to={`/courses/${entry.course_id}`}
                  className="dashboard__row-link"
                  aria-label={`${entry.courseTitle} — ${statusLabel}`}
                >
                  <Card className="dashboard__row">
                    <div className="dashboard__row-icon-chip">
                      <CourseIcon className="dashboard__row-icon" />
                    </div>
                    <div className="dashboard__row-body">
                      <span className="dashboard__row-title">{entry.courseTitle}</span>
                      {entry.completed_at ? (
                        <span className="dashboard__completed">Completed</span>
                      ) : (
                        <XpStreakBadge xp={entry.xp} streak={entry.current_streak} />
                      )}
                    </div>
                    <span className="dashboard__row-cta">
                      {ctaLabel}
                      <ChevronRight size={16} aria-hidden="true" />
                    </span>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function InstructorDashboard() {
  const [cohorts, setCohorts] = useState(null);
  const [selectedCohortId, setSelectedCohortId] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [pacing, setPacing] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Invite panel (Phase 7B.2) state -- kept local to this component rather than lifted, since
  // nothing outside the panel itself reads it.
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [bulkEmailsText, setBulkEmailsText] = useState("");
  const [bulkResults, setBulkResults] = useState(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCohorts(null);
    setSelectedCohortId(null);

    async function load() {
      try {
        const result = await cohortService.list();
        if (cancelled) return;
        setCohorts(result.cohorts);
        if (result.cohorts.length > 0) {
          setSelectedCohortId(result.cohorts[0].id);
        }
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (selectedCohortId === null) return;
    let cancelled = false;
    setCompletion(null);
    setPacing(null);
    // Invite panel state is scoped to whichever cohort was selected when it was set -- switching
    // cohorts via the picker below should never leave last cohort's bulk-import results or a
    // stale "Copied!" state showing next to a different cohort's join code.
    setBulkEmailsText("");
    setBulkResults(null);
    setInviteError(null);
    setIsCopied(false);

    async function loadCohortData() {
      try {
        const [completionResult, pacingResult] = await Promise.all([
          dashboardService.getCompletion(selectedCohortId),
          dashboardService.getLessonPacing(selectedCohortId),
        ]);
        if (cancelled) return;
        setCompletion(completionResult.courses);
        setPacing(pacingResult.lessons);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
      }
    }
    loadCohortData();
    return () => {
      cancelled = true;
    };
  }, [selectedCohortId]);

  const selectedCohort = cohorts?.find((cohort) => cohort.id === selectedCohortId) ?? null;
  const inviteLink = selectedCohort
    ? `${window.location.origin}/join/${selectedCohort.join_code}`
    : null;

  async function handleCopyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // The Clipboard API can reject (denied permission, non-HTTPS, older browsers) -- the join
      // code is still right there in the row above, so this degrades to "copy it yourself"
      // rather than a silent no-op with no feedback at all.
      setInviteError("Could not copy automatically -- copy the code above instead.");
    }
  }

  async function handleRegenerateCode() {
    setInviteError(null);
    setIsRegenerating(true);
    try {
      const updatedCohort = await cohortService.regenerateJoinCode(selectedCohortId);
      setCohorts((current) =>
        current.map((cohort) => (cohort.id === updatedCohort.id ? updatedCohort : cohort))
      );
    } catch (err) {
      setInviteError(parseApiError(err).message);
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleBulkSubmit(event) {
    event.preventDefault();
    const emails = bulkEmailsText
      .split(/[\n,]/)
      .map((email) => email.trim())
      .filter(Boolean);
    if (emails.length === 0) return;

    setInviteError(null);
    setBulkResults(null);
    setIsBulkSubmitting(true);
    try {
      const results = await cohortService.bulkEnrollStudents(selectedCohortId, emails);
      setBulkResults(results);
    } catch (err) {
      setInviteError(parseApiError(err).message);
    } finally {
      setIsBulkSubmitting(false);
    }
  }

  if (error) {
    return (
      <DashboardError message={error} onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
    );
  }

  if (cohorts === null) {
    return <DashboardSkeleton />;
  }

  if (cohorts.length === 0) {
    // Real, not a placeholder: GET /cohorts is documented instructor-only, always the caller's
    // own cohorts (02-api-contract.md §6.2, "no admin variant is documented for this route") --
    // an admin account has created zero cohorts under its own id, so this branch is the ENTIRE
    // admin experience of this page, every single time, not a rare edge case. Same hero + empty-
    // cta-card language as LearnerDashboard's own empty state below, no button here (there's
    // genuinely nothing to click through to -- cohort assignment isn't self-serve).
    return (
      <main className="dashboard">
        <div className="dashboard__hero">
          <div className="dashboard__hero-pattern" aria-hidden="true" />
          <div className="dashboard__hero-content">
            <h1>Dashboard</h1>
            <p className="dashboard__hero-subtitle">Cohort activity, for pacing and completion.</p>
          </div>
        </div>
        <Card className="dashboard__empty-cta">
          <div className="dashboard__empty-cta-text">
            <Users size={20} aria-hidden="true" className="dashboard__empty-cta-icon" />
            <div>
              <p className="dashboard__empty-cta-title">No cohorts assigned yet</p>
              <p className="dashboard__empty-cta-subtitle">
                Cohorts are provisioned directly by an admin &mdash; there&rsquo;s no self-serve
                cohort creation in this app yet, so this isn&rsquo;t a sign anything is broken.
                Once a cohort is assigned to your account, its completion and pacing data will
                appear here.
              </p>
            </div>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <div className="dashboard__hero">
        <div className="dashboard__hero-pattern" aria-hidden="true" />
        <div className="dashboard__hero-content">
          <h1>Dashboard</h1>
          <p className="dashboard__hero-subtitle">Cohort activity, for pacing and completion.</p>
          {/* completion[0].totalStudents is safe to read from just the first row -- the backend
              computes it as the cohort's whole active-roster size (a single CROSS JOIN per
              query, per dashboard.service.js), so every row in this array carries the same
              value. */}
          {completion !== null && completion.length > 0 ? (
            <div className="dashboard__hero-stats">
              <span className="dashboard__hero-stat">
                <Users size={16} aria-hidden="true" />
                {completion[0].totalStudents}{" "}
                {completion[0].totalStudents === 1 ? "student enrolled" : "students enrolled"}
              </span>
              <span className="dashboard__hero-stat">
                <BookOpen size={16} aria-hidden="true" />
                {completion.length} {completion.length === 1 ? "course" : "courses"}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {cohorts.length > 1 ? (
        <label className="dashboard__cohort-picker">
          Cohort
          <select
            value={selectedCohortId ?? ""}
            onChange={(event) => setSelectedCohortId(Number(event.target.value))}
          >
            {cohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {selectedCohort ? (
        <Card as="section" className="dashboard__section">
          <h2>
            <UserPlus className="dashboard__section-icon" size={18} aria-hidden="true" />
            Invite students
          </h2>
          <p className="dashboard__invite-intro">
            Share this link so students can join {selectedCohort.name} themselves &mdash; no need
            to add them one by one.
          </p>

          {inviteError ? (
            <p className="dashboard__banner" role="alert">
              {inviteError}
            </p>
          ) : null}

          <div className="dashboard__invite-code-row">
            <code className="dashboard__invite-code">{selectedCohort.join_code}</code>
            <Button type="button" variant="secondary" onClick={handleCopyInviteLink}>
              {isCopied ? "Copied!" : "Copy invite link"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleRegenerateCode}
              isLoading={isRegenerating}
              title="Invalidates the current code -- anyone with the old link can no longer join"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Regenerate
            </Button>
          </div>

          <form className="dashboard__bulk-form" onSubmit={handleBulkSubmit}>
            <label className="field" htmlFor="dashboard-bulk-emails">
              <span className="field__label">Or add students by email</span>
              <textarea
                id="dashboard-bulk-emails"
                className="field__control dashboard__bulk-textarea"
                placeholder="One email per line, or comma-separated"
                value={bulkEmailsText}
                onChange={(event) => setBulkEmailsText(event.target.value)}
                disabled={isBulkSubmitting}
              />
            </label>
            <Button type="submit" isLoading={isBulkSubmitting} disabled={!bulkEmailsText.trim()}>
              Add students
            </Button>
          </form>

          {bulkResults ? (
            <ul className="dashboard__bulk-results">
              {bulkResults.map((result) => (
                <li
                  key={result.email}
                  className={
                    result.status === "enrolled"
                      ? "dashboard__bulk-result dashboard__bulk-result--ok"
                      : "dashboard__bulk-result dashboard__bulk-result--fail"
                  }
                >
                  {result.email} &mdash; {result.status === "enrolled" ? "Added" : result.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <Card as="section" className="dashboard__section">
        <h2>
          <Users className="dashboard__section-icon" size={18} aria-hidden="true" />
          Completion
        </h2>
        {completion === null ? (
          <div aria-hidden="true" className="dashboard__skeleton">
            <div className="dashboard__skeleton-line" />
          </div>
        ) : completion.length === 0 ? (
          <p className="dashboard__empty">No students have started a course in this cohort yet.</p>
        ) : (
          <ul className="dashboard__list">
            {completion.map((course) => {
              const CourseIcon = getCourseIcon(course.courseTitle);
              return (
              <li key={course.courseId}>
                <Card className="dashboard__row dashboard__row--plain">
                  <h3>
                    <CourseIcon size={18} aria-hidden="true" className="dashboard__row-title-icon" />
                    {course.courseTitle}
                  </h3>
                  {/* The bar reads "engagement" (started + completed), not "% complete" -- a
                      full bar can happen the moment every enrolled student has merely started,
                      which would otherwise misread as "done" in a section titled Completion.
                      The aria-label already said this for screen readers; this caption gives
                      sighted users scanning bars quickly the same signal (critique finding). */}
                  <p className="dashboard__bar-caption">Engagement (started or completed)</p>
                  <ProgressBar
                    value={course.completed + course.inProgress}
                    max={course.totalStudents}
                    label={`${course.courseTitle} engagement`}
                  />
                  <p className="dashboard__stats">
                    {course.inProgress} in progress · {course.notStarted} not started ·{" "}
                    {course.completed} completed · {course.averageXp} avg XP
                  </p>
                </Card>
              </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card as="section" className="dashboard__section">
        <h2>
          <Gauge className="dashboard__section-icon" size={18} aria-hidden="true" />
          Lesson pacing
        </h2>
        {pacing === null ? (
          <div aria-hidden="true" className="dashboard__skeleton">
            <div className="dashboard__skeleton-line" />
          </div>
        ) : pacing.length === 0 ? (
          <p className="dashboard__empty">No question attempts recorded in this cohort yet.</p>
        ) : (
          <ul className="dashboard__list">
            {pacing.map((lesson) => (
              <li key={lesson.lessonId}>
                <Card className="dashboard__row dashboard__row--plain">
                  <h3>{lesson.lessonTitle}</h3>
                  <p className="dashboard__stats">
                    {lesson.averageInterQuestionSeconds}s avg between questions (n=
                    {lesson.sampleSize})
                  </p>
                  <p className="dashboard__note">{lesson.note}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
