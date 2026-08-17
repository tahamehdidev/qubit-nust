import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Users, Plus, ChevronRight } from "lucide-react";
import { cohortService } from "../services/cohort.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Button } from "../components/ui/Button.jsx";
import "./CohortsPage.css";

// Phase 8B: the biggest single gap the role-completeness audit found -- cohortService already
// had full create/update/remove/listStudents/removeStudent support, backend-tested and working,
// with zero UI ever calling any of it. Cohort management was "a small panel bolted onto the
// dashboard" (invite link + bulk import only); this is the real page.
export function CohortsPage() {
  const navigate = useNavigate();
  const [cohorts, setCohorts] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function load() {
      try {
        const result = await cohortService.list();
        if (!cancelled) setCohorts(result.cohorts);
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
      const cohort = await cohortService.create({ name, instructorId: undefined });
      // Straight to the new cohort's own page -- inviting students is the very next thing an
      // instructor does after creating one, not a second trip back through this list.
      navigate(`/cohorts/${cohort.id}`);
    } catch (err) {
      setCreateError(parseApiError(err).message);
      setIsCreating(false);
    }
  }

  if (error) {
    return (
      <main className="cohorts-page">
        <h1>Cohorts</h1>
        <p className="cohorts-page__banner" role="alert">
          {error}
        </p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
      </main>
    );
  }

  return (
    <main className="cohorts-page">
      <h1>Cohorts</h1>
      <p className="cohorts-page__subtitle">Create a cohort, then invite students to join it.</p>

      <Card as="section" className="cohorts-page__section">
        <h2>
          <Plus className="cohorts-page__section-icon" size={18} aria-hidden="true" />
          Create a cohort
        </h2>
        {createError ? (
          <p className="cohorts-page__banner" role="alert">
            {createError}
          </p>
        ) : null}
        <form className="cohorts-page__create-form" onSubmit={handleCreateSubmit}>
          <Input
            label="Cohort name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={100}
            disabled={isCreating}
          />
          <Button type="submit" isLoading={isCreating}>
            Create cohort
          </Button>
        </form>
      </Card>

      {cohorts === null ? (
        <div className="cohorts-page__skeleton" aria-hidden="true">
          <div className="cohorts-page__skeleton-row" />
          <div className="cohorts-page__skeleton-row" />
        </div>
      ) : cohorts.length === 0 ? (
        <p className="cohorts-page__empty">
          No cohorts yet &mdash; create one above to start inviting students.
        </p>
      ) : (
        <ul className="cohorts-page__list">
          {cohorts.map((cohort) => (
            <li key={cohort.id}>
              <Link to={`/cohorts/${cohort.id}`} className="cohorts-page__card-link">
                <Card className="cohorts-page__card">
                  <div className="cohorts-page__card-icon-chip">
                    <Users size={20} aria-hidden="true" />
                  </div>
                  <div className="cohorts-page__card-body">
                    <span className="cohorts-page__card-name">{cohort.name}</span>
                    <code className="cohorts-page__card-code">{cohort.join_code}</code>
                  </div>
                  <ChevronRight size={16} aria-hidden="true" className="cohorts-page__card-cta" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
