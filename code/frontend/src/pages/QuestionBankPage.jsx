import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { questionService } from "../services/question.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { Card } from "../components/ui/Card.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Button } from "../components/ui/Button.jsx";
import "./QuestionBankPage.css";

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "mcq", label: "Multiple choice" },
  { value: "drag_drop", label: "Drag to order" },
  { value: "numeric", label: "Numeric" },
];

// Phase 9 (Milestone 6). questionService.list is the only genuinely paginated endpoint in the
// API (02-api-contract.md §4.3) -- page/limit are real query params here, not decorative, unlike
// every other list page in this phase. Read access is open to any logged-in user server-side
// (question.routes.js), but this page itself sits behind the same instructor/admin RoleGate as
// the rest of /admin/content -- makes cross-course question reuse discoverable during authoring.
export function QuestionBankPage() {
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function load() {
      try {
        const data = await questionService.list({
          search: debouncedSearch || undefined,
          type: type || undefined,
          page,
        });
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, type, page, loadAttempt]);

  function handleSearchChange(value) {
    setSearchInput(value);
    setPage(1);
  }

  function handleTypeChange(value) {
    setType(value);
    setPage(1);
  }

  const hasNextPage = result ? page * result.pagination.limit < result.pagination.total : false;

  if (error) {
    return (
      <main className="question-bank">
        <h1>Question bank</h1>
        <p className="question-bank__banner" role="alert">
          {error}
        </p>
        <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
      </main>
    );
  }

  return (
    <main className="question-bank">
      <div className="question-bank__header">
        <h1>Question bank</h1>
        <Link to="/admin/content/questions/new" className="question-bank__new-link">
          <Plus size={16} aria-hidden="true" />
          New question
        </Link>
      </div>

      <Card as="section" className="question-bank__filters">
        <Input
          label="Search"
          value={searchInput}
          onChange={(event) => handleSearchChange(event.target.value)}
        />
        <label className="field">
          <span className="field__label">Type</span>
          <select value={type} onChange={(event) => handleTypeChange(event.target.value)}>
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </Card>

      {result === null ? (
        <p className="question-bank__empty">Loading&hellip;</p>
      ) : result.questions.length === 0 ? (
        <p className="question-bank__empty">No questions found.</p>
      ) : (
        <ul className="question-bank__list">
          {result.questions.map((question) => (
            <li key={question.id}>
              <Link
                to={`/admin/content/questions/${question.id}`}
                className="question-bank__item"
              >
                <span className="question-bank__type-badge">{question.type}</span>
                <span className="question-bank__prompt">{question.prompt}</span>
                {question.createdById === user.id ? (
                  <span className="question-bank__owner-tag">Yours</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result && (page > 1 || hasNextPage) ? (
        <div className="question-bank__pagination">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPage((current) => current - 1)}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="question-bank__page-label">Page {page}</span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPage((current) => current + 1)}
            disabled={!hasNextPage}
          >
            Next
          </Button>
        </div>
      ) : null}
    </main>
  );
}
