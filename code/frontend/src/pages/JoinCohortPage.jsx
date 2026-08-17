import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cohortService } from "../services/cohort.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import "./JoinCohortPage.css";

// Sits behind ProtectedRoute (App.jsx) -- an unauthenticated visitor following a shared join link
// is bounced to /login first, with this route stashed in location.state.from the same way any
// other protected page would be, then lands back here automatically after signing in.
//
// The join itself fires on mount rather than behind a confirm click: the code is already the
// confirmation (a learner who clicked/typed this exact link intends to join), and a second click
// would just be friction for the common case while adding nothing for the rare mistaken-link case
// -- the error state below still gives a clear way out if the code turns out to be wrong.
export function JoinCohortPage() {
  const { joinCode } = useParams();
  const [status, setStatus] = useState("joining"); // joining | joined | already | error
  const [cohortName, setCohortName] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("joining");

    async function attemptJoin() {
      try {
        const { cohort } = await cohortService.join(joinCode);
        if (cancelled) return;
        setCohortName(cohort.name);
        setStatus("joined");
      } catch (err) {
        if (cancelled) return;
        const parsed = parseApiError(err);
        // An already-active enrollment (e.g. the learner re-clicks an old link, or double-taps
        // the button) isn't really a failure from where they're standing -- they end up in
        // exactly the state they wanted, so this gets the same success framing as a fresh join.
        if (parsed.code === "DUPLICATE_RESOURCE") {
          setStatus("already");
        } else {
          setErrorMessage(parsed.message);
          setStatus("error");
        }
      }
    }
    attemptJoin();
    return () => {
      cancelled = true;
    };
  }, [joinCode]);

  return (
    <main className="join-cohort">
      <Card className="join-cohort__card">
        {status === "joining" ? (
          <>
            <Loader2 className="join-cohort__icon join-cohort__icon--joining" aria-hidden="true" />
            <p className="join-cohort__status" role="status">
              Joining your cohort&hellip;
            </p>
          </>
        ) : status === "joined" || status === "already" ? (
          <>
            <CheckCircle2 className="join-cohort__icon join-cohort__icon--success" aria-hidden="true" />
            <h1>{status === "joined" ? "You're in" : "Already joined"}</h1>
            <p className="join-cohort__body">
              {status === "joined"
                ? `You've joined ${cohortName}.`
                : `You're already enrolled in ${cohortName ?? "this cohort"}.`}
            </p>
            <Link to="/dashboard" className="button button--primary">
              Go to your dashboard
            </Link>
          </>
        ) : (
          <>
            <XCircle className="join-cohort__icon join-cohort__icon--error" aria-hidden="true" />
            <h1>Couldn&rsquo;t join this cohort</h1>
            <p className="join-cohort__body" role="alert">
              {errorMessage}
            </p>
            <Link to="/courses" className="button button--primary">
              Browse courses instead
            </Link>
          </>
        )}
      </Card>
    </main>
  );
}
