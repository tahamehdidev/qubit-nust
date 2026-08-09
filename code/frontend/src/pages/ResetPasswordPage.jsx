import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { passwordResetService } from "../services/passwordReset.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Button } from "../components/ui/Button.jsx";
import { AuthShowcase } from "./AuthShowcase.jsx";
import { QubitMark } from "./LandingLogo.jsx";
import "./AuthPage.css";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setPasswordError(null);

    // Same rationale as SignupPage: check in JS rather than relying on the native minLength
    // attribute, which blocks submission with an unstyled, screen-reader-invisible tooltip.
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      await passwordResetService.confirmReset({ token, newPassword: password });
      navigate("/login", { replace: true, state: { justResetPassword: true } });
    } catch (err) {
      setError(parseApiError(err).message);
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Card className="auth-page__frame">
        <AuthShowcase />
        <div className="auth-page__form-panel">
          <QubitMark className="auth-page__form-mark" />
          <h1>Choose a new password</h1>
          {!token ? (
            <>
              <p className="auth-page__banner auth-page__banner--error" role="alert">
                This link is missing its reset code. Request a new one to continue.
              </p>
              <p className="auth-page__switch">
                <Link to="/forgot-password">Request a new link</Link>
              </p>
            </>
          ) : (
            <>
              {error ? (
                <p className="auth-page__banner auth-page__banner--error" role="alert">
                  {error}
                </p>
              ) : null}
              <form className="auth-page__form" onSubmit={handleSubmit}>
                <Input
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  required
                  disabled={isSubmitting}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={passwordError}
                  hint="At least 8 characters"
                />
                <Button type="submit" isLoading={isSubmitting} className="auth-page__submit">
                  Reset password
                </Button>
              </form>
              {error ? (
                <p className="auth-page__switch">
                  <Link to="/forgot-password">Request a new link</Link>
                </p>
              ) : null}
            </>
          )}
        </div>
      </Card>
    </main>
  );
}
