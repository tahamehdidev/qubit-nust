import { useState } from "react";
import { Link } from "react-router-dom";
import { passwordResetService } from "../services/passwordReset.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Button } from "../components/ui/Button.jsx";
import { AuthShowcase } from "./AuthShowcase.jsx";
import { QubitMark } from "./LandingLogo.jsx";
import "./AuthPage.css";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Set once the request succeeds and never reset -- the backend's response is deliberately
  // identical whether or not the email is registered (enumeration safety), so the UI has nothing
  // more specific to say and no reason to let the visitor "try again" with a different address.
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await passwordResetService.requestReset(email);
      setIsSubmitted(true);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Card className="auth-page__frame">
        <AuthShowcase />
        <div className="auth-page__form-panel">
          <QubitMark className="auth-page__form-mark" />
          <h1>Reset your password</h1>
          {isSubmitted ? (
            <>
              <p className="auth-page__banner auth-page__banner--success" role="status">
                If an account exists for {email}, we&rsquo;ve sent a link to reset your password.
                It expires in 30 minutes.
              </p>
              <p className="auth-page__switch">
                <Link to="/login">Back to log in</Link>
              </p>
            </>
          ) : (
            <>
              <p className="auth-page__reassurance">
                Enter the email you signed up with and we&rsquo;ll send you a link to choose a new
                password.
              </p>
              {error ? (
                <p className="auth-page__banner auth-page__banner--error" role="alert">
                  {error}
                </p>
              ) : null}
              <form className="auth-page__form" onSubmit={handleSubmit}>
                <Input
                  label="Your email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={isSubmitting}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <Button type="submit" isLoading={isSubmitting} className="auth-page__submit">
                  Send reset link
                </Button>
              </form>
              <p className="auth-page__switch">
                Remembered it after all? <Link to="/login">Log in</Link>
              </p>
            </>
          )}
        </div>
      </Card>
    </main>
  );
}
