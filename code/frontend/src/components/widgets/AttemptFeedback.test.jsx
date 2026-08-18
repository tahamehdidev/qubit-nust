import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttemptFeedback } from "./AttemptFeedback.jsx";
import { ATTEMPT_STATUS } from "../../hooks/useQuestionAttempt.js";

test("renders nothing for unattempted/submitting", () => {
  const { container: unattempted } = render(
    <AttemptFeedback status={ATTEMPT_STATUS.UNATTEMPTED} result={null} />
  );
  expect(unattempted).toBeEmptyDOMElement();

  const { container: submitting } = render(
    <AttemptFeedback status={ATTEMPT_STATUS.SUBMITTING} result={null} />
  );
  expect(submitting).toBeEmptyDOMElement();
});

test("renders a distinct XP-awarded badge for a first-time correct answer", () => {
  const { container } = render(
    <AttemptFeedback status={ATTEMPT_STATUS.CORRECT} result={{ xpAwarded: true }} />
  );
  expect(screen.getByRole("status")).toHaveTextContent("Correct! XP awarded");
  expect(container.querySelector(".attempt-feedback__xp-badge")).toBeInTheDocument();
});

test("renders the already-had-credit message when correct but xpAwarded is false, with no XP badge", () => {
  const { container } = render(
    <AttemptFeedback status={ATTEMPT_STATUS.CORRECT} result={{ xpAwarded: false }} />
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Correct! You already earned XP for this question."
  );
  expect(container.querySelector(".attempt-feedback__xp-badge")).not.toBeInTheDocument();
});

test("renders incorrect feedback in the caution color, not the destructive/error color", () => {
  render(<AttemptFeedback status={ATTEMPT_STATUS.INCORRECT} result={null} />);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("Not quite — try again.");
  // Regression guard for the caution-color migration -- wrong-but-retriable must stay visually
  // distinct from a real submission error (attempt-feedback--error), not silently merge with it.
  expect(status).toHaveClass("attempt-feedback--incorrect");
  expect(status).not.toHaveClass("attempt-feedback--error");
});

test("renders a submission-error alert", () => {
  render(<AttemptFeedback status={ATTEMPT_STATUS.ERROR} result={null} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Could not submit your answer");
});

test("renders the explanation on a correct attempt when present", () => {
  render(
    <AttemptFeedback
      status={ATTEMPT_STATUS.CORRECT}
      result={{ xpAwarded: true, explanation: "Because the Hadamard gate creates superposition." }}
    />
  );
  expect(screen.getByText("Because the Hadamard gate creates superposition.")).toBeInTheDocument();
});

test("renders the explanation on an incorrect attempt when present", () => {
  render(
    <AttemptFeedback
      status={ATTEMPT_STATUS.INCORRECT}
      result={{ explanation: "Because the Hadamard gate creates superposition." }}
    />
  );
  expect(screen.getByText("Because the Hadamard gate creates superposition.")).toBeInTheDocument();
});

test("renders no explanation block when the question has none authored (null)", () => {
  const { container } = render(
    <AttemptFeedback
      status={ATTEMPT_STATUS.CORRECT}
      result={{ xpAwarded: true, explanation: null }}
    />
  );
  expect(container.querySelector(".attempt-feedback__explanation")).not.toBeInTheDocument();
});

test("does not crash when result is null on an incorrect attempt", () => {
  render(<AttemptFeedback status={ATTEMPT_STATUS.INCORRECT} result={null} />);
  expect(screen.getByRole("status")).toHaveTextContent("Not quite — try again.");
});
