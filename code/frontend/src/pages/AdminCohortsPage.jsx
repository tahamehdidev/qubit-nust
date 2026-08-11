import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { cohortService } from "../services/cohort.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Button } from "../components/ui/Button.jsx";
import "./AdminCohortsPage.css";

// Phase 8C: admin previously had no way to see any cohort it didn't already know the numeric id
// of -- GET /cohorts had no admin variant at all, and cohortRepository had no findAll(). This is
// deliberately visibility only, not full cohort management (that stays the owning instructor's
// job on /cohorts/:id) -- follows AdminUsersPage's own table/list pattern rather than inventing a
// new one.
export function AdminCohortsPage() {
  const [cohorts, setCohorts] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function load() {
      try {
        const result = await cohortService.listAll();
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

  return (
    <main className="admin-cohorts">
      <h1>Cohorts</h1>
      <p className="admin-cohorts__subtitle">
        Every cohort across every instructor. Roster and invite management stay with the owning
        instructor.
      </p>

      <Card as="section" className="admin-cohorts__section">
        <h2>
          <Users className="admin-cohorts__section-icon" size={18} aria-hidden="true" />
          All cohorts
        </h2>

        {error ? (
          <p className="admin-cohorts__banner" role="alert">
            {error}
          </p>
        ) : null}

        {error ? (
          <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
        ) : cohorts === null ? (
          <p className="admin-cohorts__empty">Loading&hellip;</p>
        ) : cohorts.length === 0 ? (
          <p className="admin-cohorts__empty">No cohorts exist yet.</p>
        ) : (
          <ul className="admin-cohorts__list">
            {cohorts.map((cohort) => (
              <li key={cohort.id} className="admin-cohorts__row">
                <div className="admin-cohorts__row-body">
                  <span className="admin-cohorts__row-name">{cohort.name}</span>
                  <span className="admin-cohorts__row-instructor">
                    {cohort.instructor_name} &middot; {cohort.instructor_email}
                  </span>
                </div>
                <code className="admin-cohorts__row-code">{cohort.join_code}</code>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
