import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { BookOpen, Plus, ChevronRight } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { courseService } from "../services/course.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Button } from "../components/ui/Button.jsx";
import "./ContentCoursesPage.css";

// Phase 9 (Milestone 1): courseService already had full create/update/remove support,
// backend-tested and working, with zero UI ever calling any of it -- content only ever entered
// the platform via the one-time seed script. This is the entry point for real, in-app authoring.
// Follows CohortsPage.jsx's own list+inline-create shape.
export function ContentCoursesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [title, setTitle] = useState("");
  const [narrative, setNarrative] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function load() {
      try {
        const result = await courseService.list();
        if (!cancelled) setCourses(result.courses);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  async function handleCreateSubmit(event) {
    event.preventDefault();
    setCreateError(null);
    setIsCreating(true);
    try {
      const course = await courseService.create({ title, narrative: narrative || undefined });
      // Straight to the new course's own page -- adding chapters is the very next thing an
      // author does after creating one, not a second trip back through this list.
      navigate(`/admin/content/courses/${course.id}`);
    } catch (err) {
      setCreateError(parseApiError(err).message);
      setIsCreating(false);
    }
  }

  if (error) {
    return (
      <main className="content-courses">
        <h1>Content</h1>
        <p className="content-courses__banner" role="alert">
          {error}
        </p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
      </main>
    );
  }

  return (
    <main className="content-courses">
      <h1>Content</h1>
      <p className="content-courses__subtitle">
        Create a course, then add chapters, lessons, and screens to it.
      </p>

      <Card as="section" className="content-courses__section">
        <h2>
          <Plus className="content-courses__section-icon" size={18} aria-hidden="true" />
          Create a course
        </h2>
        {createError ? (
          <p className="content-courses__banner" role="alert">
            {createError}
          </p>
        ) : null}
        <form className="content-courses__create-form" onSubmit={handleCreateSubmit}>
          <Input
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={200}
            disabled={isCreating}
          />
          <label className="field" htmlFor="content-courses-narrative">
            <span className="field__label">Narrative (optional)</span>
            <textarea
              id="content-courses-narrative"
              className="field__control content-courses__narrative-textarea"
              value={narrative}
              onChange={(event) => setNarrative(event.target.value)}
              disabled={isCreating}
            />
          </label>
          <Button type="submit" isLoading={isCreating}>
            Create course
          </Button>
        </form>
      </Card>

      {courses === null ? (
        <p className="content-courses__empty">Loading&hellip;</p>
      ) : courses.length === 0 ? (
        <p className="content-courses__empty">
          No courses yet &mdash; create one above to get started.
        </p>
      ) : (
        <ul className="content-courses__list">
          {courses.map((course) => (
            <li key={course.id}>
              <Link
                to={`/admin/content/courses/${course.id}`}
                className="content-courses__card-link"
              >
                <Card className="content-courses__card">
                  <div className="content-courses__card-icon-chip">
                    <BookOpen size={20} aria-hidden="true" />
                  </div>
                  <div className="content-courses__card-body">
                    <span className="content-courses__card-title">{course.title}</span>
                    {/* Admin bypasses ownership everywhere else in this app -- flagging "by
                        someone else" here is purely informational for an instructor, not a
                        gate; the actual write-permission check happens per-action, server-side. */}
                    <span className="content-courses__card-owner">
                      {course.created_by_id === user.id
                        ? "Yours"
                        : user.role === "admin"
                          ? "By another instructor"
                          : "Not yours -- read only"}
                    </span>
                  </div>
                  <ChevronRight
                    size={16}
                    aria-hidden="true"
                    className="content-courses__card-cta"
                  />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
