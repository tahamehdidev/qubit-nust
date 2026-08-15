import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { questionService } from "../../services/question.service.js";
import { parseApiError } from "../../utils/parseApiError.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { Input } from "../ui/Input.jsx";
import { Button } from "../ui/Button.jsx";
import "./QuestionPicker.css";

const RESULTS_PER_PAGE = 10;

// Phase 9 (Milestone 6). Reusable search+pick surface -- rendered inside a Modal by whichever
// caller triggers it (QuestionScreenForm here, ContentPracticeSetDetailPage in Milestone 7). Does
// not itself call attachQuestion: the caller owns which junction (screen vs practice set) to
// attach through, and its own loading/error state for that call -- this component only ever
// reports back which question was picked, via `onPick`.
export function QuestionPicker({ onPick, isPicking = false }) {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function load() {
      try {
        const data = await questionService.list({
          search: debouncedSearch || undefined,
          page,
          limit: RESULTS_PER_PAGE,
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
  }, [debouncedSearch, page]);

  function handleSearchChange(value) {
    setSearchInput(value);
    setPage(1);
  }

  const hasNextPage = result ? page * result.pagination.limit < result.pagination.total : false;

  return (
    <div className="question-picker">
      <Input
        label="Search"
        value={searchInput}
        onChange={(event) => handleSearchChange(event.target.value)}
      />

      {error ? (
        <p className="question-picker__banner" role="alert">
          {error}
        </p>
      ) : result === null ? (
        <p className="question-picker__empty">Loading&hellip;</p>
      ) : result.questions.length === 0 ? (
        <p className="question-picker__empty">No questions found.</p>
      ) : (
        <ul className="question-picker__list">
          {result.questions.map((question) => (
            <li key={question.id} className="question-picker__item">
              <span className="question-picker__type-badge">{question.type}</span>
              <span className="question-picker__prompt">
                {question.prompt.length > 80 ? `${question.prompt.slice(0, 80)}…` : question.prompt}
              </span>
              <Button
                type="button"
                onClick={() => onPick(question)}
                isLoading={isPicking}
                disabled={isPicking}
              >
                Use this question
              </Button>
            </li>
          ))}
        </ul>
      )}

      {result && (page > 1 || hasNextPage) ? (
        <div className="question-picker__pagination">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPage((current) => current - 1)}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="question-picker__page-label">Page {page}</span>
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

      <Link to="/admin/content/questions/new" className="question-picker__create-link">
        Create new question instead
      </Link>
    </div>
  );
}
