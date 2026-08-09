import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserCog, KeyRound } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { userService } from "../services/user.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Button } from "../components/ui/Button.jsx";
import "./SettingsPage.css";

// Phase 8D: the one page every role was missing entirely -- no role could previously update their
// own name (PATCH /users/me existed and was tested, but no page ever called it) or change their
// password while logged in (only the logged-out forgot-password flow existed). Follows
// AdminUsersPage's own two-Card-section layout rather than inventing a new page shape.
export function SettingsPage() {
  const { user, updateUser, clearSession } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState(null);
  const [nameSaved, setNameSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [newPasswordFieldError, setNewPasswordFieldError] = useState(null);

  async function handleNameSubmit(event) {
    event.preventDefault();
    setNameError(null);
    setNameSaved(false);
    setIsSavingName(true);
    try {
      const updated = await userService.updateMe({ name });
      updateUser({ name: updated.name });
      setNameSaved(true);
    } catch (err) {
      setNameError(parseApiError(err).message);
    } finally {
      setIsSavingName(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordError(null);
    setNewPasswordFieldError(null);

    // Same client-side floor as SignupPage/ResetPasswordPage -- checked in JS rather than left to
    // the native minLength attribute, which blocks submission with an unstyled, screen-reader-
    // invisible tooltip instead of this form's own role="alert" error state.
    if (newPassword.length < 8) {
      setNewPasswordFieldError("Password must be at least 8 characters.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await userService.changePassword({ currentPassword, newPassword });
      // The backend already revoked every session, including this one -- clearSession() just
      // drops local state to match, rather than calling logout() against a session that's
      // already gone.
      clearSession();
      navigate("/login", { replace: true, state: { justChangedPassword: true } });
    } catch (err) {
      setPasswordError(parseApiError(err).message);
      setIsChangingPassword(false);
    }
  }

  return (
    <main className="settings-page">
      <h1>Settings</h1>
      <p className="settings-page__subtitle">Update your name or change your password.</p>

      <Card as="section" className="settings-page__section">
        <h2>
          <UserCog className="settings-page__section-icon" size={18} aria-hidden="true" />
          Profile
        </h2>
        {nameError ? (
          <p className="settings-page__banner" role="alert">
            {nameError}
          </p>
        ) : null}
        {nameSaved ? (
          <p className="settings-page__banner settings-page__banner--success" role="status">
            Name updated.
          </p>
        ) : null}
        <form className="settings-page__form" onSubmit={handleNameSubmit}>
          <Input
            label="Name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameSaved(false);
            }}
            required
            maxLength={100}
            disabled={isSavingName}
          />
          <Button type="submit" isLoading={isSavingName}>
            Save name
          </Button>
        </form>
      </Card>

      <Card as="section" className="settings-page__section">
        <h2>
          <KeyRound className="settings-page__section-icon" size={18} aria-hidden="true" />
          Password
        </h2>
        {passwordError ? (
          <p className="settings-page__banner" role="alert">
            {passwordError}
          </p>
        ) : null}
        <form className="settings-page__form" onSubmit={handlePasswordSubmit}>
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isChangingPassword}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            disabled={isChangingPassword}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            error={newPasswordFieldError}
            hint="At least 8 characters"
          />
          <p className="settings-page__password-note">
            Changing your password will log you out of every other device.
          </p>
          <Button type="submit" isLoading={isChangingPassword}>
            Change password
          </Button>
        </form>
      </Card>
    </main>
  );
}
