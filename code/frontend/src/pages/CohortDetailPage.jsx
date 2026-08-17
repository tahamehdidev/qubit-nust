import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { UserPlus, Users, RefreshCw, TrendingUp, Trash2, ArrowLeft } from "lucide-react";
import { cohortService } from "../services/cohort.service.js";
import { courseService } from "../services/course.service.js";
import { progressService } from "../services/progress.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import "./CohortDetailPage.css";

// Phase 8B. Everything on this page already existed at the backend/service layer -- rename,
// regenerate join code, bulk-enroll, remove a student, delete the cohort -- but had zero UI
// caller. The one genuinely new surface is the per-student progress drill-down, which reuses
// progressService.listForUser (already ownership-checked server-side for an instructor viewing
// their own cohort's students) rather than inventing a new endpoint for it.
export function CohortDetailPage() {
  const { cohortId } = useParams();
  const navigate = useNavigate();

  const [cohort, setCohort] = useState(null);
  const [students, setStudents] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [name, setName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState(null);
  const [renameSaved, setRenameSaved] = useState(false);

  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [inviteError, setInviteError] = useState(null);
  const [bulkEmailsText, setBulkEmailsText] = useState("");
  const [bulkResults, setBulkResults] = useState(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  const [removingUserId, setRemovingUserId] = useState(null);
  const [rosterError, setRosterError] = useState(null);

  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Per-student progress drill-down (Phase 8B's one genuinely new surface) -- one row expanded
  // at a time, courses fetched once and shared across every row's course picker.
  const [courses, setCourses] = useState(null);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [progressEntry, setProgressEntry] = useState(null);
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  const [progressError, setProgressError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCohort(null);
    setStudents(null);

    async function load() {
      try {
        const [cohortResult, studentsResult, coursesResult] = await Promise.all([
          cohortService.getById(cohortId),
          cohortService.listStudents(cohortId),
          courseService.list(),
        ]);
        if (cancelled) return;
        setCohort(cohortResult);
        setName(cohortResult.name);
        setStudents(studentsResult.students);
        setCourses(coursesResult.courses);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [cohortId, loadAttempt]);

  async function handleRenameSubmit(event) {
    event.preventDefault();
    setRenameError(null);
    setRenameSaved(false);
    setIsRenaming(true);
    try {
      const updated = await cohortService.update(cohortId, { name });
      setCohort(updated);
      setRenameSaved(true);
    } catch (err) {
      setRenameError(parseApiError(err).message);
    } finally {
      setIsRenaming(false);
    }
  }

  const inviteLink = cohort ? `${window.location.origin}/join/${cohort.join_code}` : null;

  async function handleCopyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      setInviteError("Could not copy automatically -- copy the code above instead.");
    }
  }

  async function handleRegenerateCode() {
    setInviteError(null);
    setIsRegenerating(true);
    try {
      const updated = await cohortService.regenerateJoinCode(cohortId);
      setCohort(updated);
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
      const results = await cohortService.bulkEnrollStudents(cohortId, emails);
      setBulkResults(results);
      setLoadAttempt((attempt) => attempt + 1); // newly enrolled students should show up below
    } catch (err) {
      setInviteError(parseApiError(err).message);
    } finally {
      setIsBulkSubmitting(false);
    }
  }

  async function handleRemoveStudent(userId) {
    setRosterError(null);
    setRemovingUserId(userId);
    try {
      await cohortService.removeStudent(cohortId, userId);
      setStudents((current) => current.filter((student) => student.user_id !== userId));
    } catch (err) {
      setRosterError(parseApiError(err).message);
    } finally {
      setRemovingUserId(null);
    }
  }

  async function handleConfirmDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await cohortService.remove(cohortId);
      navigate("/cohorts");
    } catch (err) {
      setDeleteError(parseApiError(err).message);
      setPendingDelete(false);
      setIsDeleting(false);
    }
  }

  function handleToggleProgress(userId) {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(userId);
    setSelectedCourseId("");
    setProgressEntry(null);
    setProgressError(null);
  }

  async function handleCourseSelect(userId, courseId) {
    setSelectedCourseId(courseId);
    setProgressEntry(null);
    setProgressError(null);
    if (!courseId) return;
    setIsLoadingProgress(true);
    try {
      const result = await progressService.listForUser({ userId, courseId });
      setProgressEntry(result.progress[0] ?? null);
    } catch (err) {
      setProgressError(parseApiError(err).message);
    } finally {
      setIsLoadingProgress(false);
    }
  }

  if (error) {
    return (
      <main className="cohort-detail">
        <p className="cohort-detail__banner" role="alert">
          {error}
        </p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
      </main>
    );
  }

  if (cohort === null || students === null) {
    return (
      <main className="cohort-detail">
        <div className="cohort-detail__skeleton" aria-hidden="true">
          <div className="cohort-detail__skeleton-block" />
          <div className="cohort-detail__skeleton-block" />
        </div>
      </main>
    );
  }

  return (
    <main className="cohort-detail">
      <Link to="/cohorts" className="cohort-detail__back">
        <ArrowLeft size={16} aria-hidden="true" />
        All cohorts
      </Link>

      <Card as="section" className="cohort-detail__section">
        <h1>{cohort.name}</h1>
        {renameError ? (
          <p className="cohort-detail__banner" role="alert">
            {renameError}
          </p>
        ) : null}
        {renameSaved ? (
          <p className="cohort-detail__banner cohort-detail__banner--success" role="status">
            Renamed.
          </p>
        ) : null}
        <form className="cohort-detail__rename-form" onSubmit={handleRenameSubmit}>
          <Input
            label="Cohort name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setRenameSaved(false);
            }}
            required
            maxLength={100}
            disabled={isRenaming}
          />
          <Button type="submit" isLoading={isRenaming}>
            Save name
          </Button>
        </form>
      </Card>

      <Card as="section" className="cohort-detail__section">
        <h2>
          <UserPlus className="cohort-detail__section-icon" size={18} aria-hidden="true" />
          Invite students
        </h2>
        <p className="cohort-detail__invite-intro">
          Share this link so students can join {cohort.name} themselves &mdash; no need to add
          them one by one.
        </p>

        {inviteError ? (
          <p className="cohort-detail__banner" role="alert">
            {inviteError}
          </p>
        ) : null}

        <div className="cohort-detail__invite-code-row">
          <code className="cohort-detail__invite-code">{cohort.join_code}</code>
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

        <form className="cohort-detail__bulk-form" onSubmit={handleBulkSubmit}>
          <label className="field" htmlFor="cohort-detail-bulk-emails">
            <span className="field__label">Or add students by email</span>
            <textarea
              id="cohort-detail-bulk-emails"
              className="field__control cohort-detail__bulk-textarea"
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
          <ul className="cohort-detail__bulk-results">
            {bulkResults.map((result) => (
              <li
                key={result.email}
                className={
                  result.status === "enrolled"
                    ? "cohort-detail__bulk-result cohort-detail__bulk-result--ok"
                    : "cohort-detail__bulk-result cohort-detail__bulk-result--fail"
                }
              >
                {result.email} &mdash; {result.status === "enrolled" ? "Added" : result.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card as="section" className="cohort-detail__section">
        <h2>
          <Users className="cohort-detail__section-icon" size={18} aria-hidden="true" />
          Roster
        </h2>
        {rosterError ? (
          <p className="cohort-detail__banner" role="alert">
            {rosterError}
          </p>
        ) : null}
        {students.length === 0 ? (
          <p className="cohort-detail__empty">No students enrolled yet.</p>
        ) : (
          <ul className="cohort-detail__roster">
            {students.map((student) => (
              <li key={student.id} className="cohort-detail__roster-item">
                <div className="cohort-detail__roster-row">
                  <div className="cohort-detail__roster-body">
                    <span className="cohort-detail__roster-name">{student.name}</span>
                    <span className="cohort-detail__roster-email">{student.email}</span>
                  </div>
                  <span className="cohort-detail__roster-date">
                    Joined {new Date(student.enrolled_at).toLocaleDateString()}
                  </span>
                  <div className="cohort-detail__roster-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleToggleProgress(student.user_id)}
                    >
                      <TrendingUp size={16} aria-hidden="true" />
                      {expandedUserId === student.user_id ? "Hide progress" : "View progress"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      isLoading={removingUserId === student.user_id}
                      onClick={() => handleRemoveStudent(student.user_id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                {expandedUserId === student.user_id ? (
                  <div className="cohort-detail__progress-panel">
                    <label className="cohort-detail__progress-select">
                      Course
                      <select
                        value={selectedCourseId}
                        onChange={(event) =>
                          handleCourseSelect(student.user_id, event.target.value)
                        }
                      >
                        <option value="">Choose a course&hellip;</option>
                        {(courses ?? []).map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {isLoadingProgress ? (
                      <p className="cohort-detail__progress-status">Loading&hellip;</p>
                    ) : progressError ? (
                      <p className="cohort-detail__banner" role="alert">
                        {progressError}
                      </p>
                    ) : progressEntry === null && selectedCourseId ? (
                      <p className="cohort-detail__progress-status">
                        No progress recorded for this course.
                      </p>
                    ) : progressEntry ? (
                      <p className="cohort-detail__progress-status">
                        {progressEntry.xp} XP &middot; {progressEntry.current_streak}-day streak
                        {progressEntry.completed_at ? " · Completed" : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card as="section" className="cohort-detail__section cohort-detail__danger">
        <h2>Danger zone</h2>
        {deleteError ? (
          <p className="cohort-detail__banner" role="alert">
            {deleteError}
          </p>
        ) : null}
        <p className="cohort-detail__danger-copy">
          Deleting this cohort removes every enrollment record for it. This can&rsquo;t be undone.
        </p>
        <Button type="button" variant="destructive" onClick={() => setPendingDelete(true)}>
          <Trash2 size={16} aria-hidden="true" />
          Delete cohort
        </Button>
      </Card>

      <Modal
        isOpen={pendingDelete}
        onClose={() => setPendingDelete(false)}
        title="Delete this cohort?"
      >
        <p>
          {cohort.name} and all {students.length} enrollment record
          {students.length === 1 ? "" : "s"} will be permanently removed.
        </p>
        <div className="cohort-detail__modal-actions">
          <Button type="button" variant="secondary" onClick={() => setPendingDelete(false)}>
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
