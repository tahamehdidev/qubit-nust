import { useEffect, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { adminService } from "../services/admin.service.js";
import { parseApiError } from "../utils/parseApiError.js";
import { Card } from "../components/ui/Card.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import "./AdminUsersPage.css";

const PAGE_SIZE = 20;

// Phase 8A: the admin-only check moved to RoleGate, wrapping this route in App.jsx, now that
// there's a second role-gated destination to justify a shared component (Phase 7C.1's inline
// check here was a deliberate one-off at the time, per its own comment).
export function AdminUsersPage() {
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  // The generated password is only ever returned once, in this response -- there's nowhere else
  // to see it again, so it stays visible until the admin navigates away or creates another.
  const [createdAccount, setCreatedAccount] = useState(null);

  const [users, setUsers] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [pendingDeactivation, setPendingDeactivation] = useState(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Phase 8C: reactivate + role-change are both quick per-row actions, unlike deactivation --
  // no confirmation dialog (deactivation logs the account out immediately and blocks login;
  // these two don't have that same one-way-feeling consequence, and each is a single click to
  // reverse if it turns out to be a mistake). actionError is shared between both since they're
  // both transient, per-row failures shown in the same banner slot listError already uses.
  const [actionError, setActionError] = useState(null);
  const [reactivatingId, setReactivatingId] = useState(null);
  const [changingRoleId, setChangingRoleId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setListError(null);

    async function load() {
      try {
        const result = await adminService.listUsers({
          search: search || undefined,
          role: roleFilter || undefined,
          page,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        setUsers(result.users);
        setPagination(result.pagination);
      } catch (err) {
        if (!cancelled) setListError(parseApiError(err).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [search, roleFilter, page, loadAttempt]);

  async function handleCreateSubmit(event) {
    event.preventDefault();
    setCreateError(null);
    setCreatedAccount(null);
    setIsCreating(true);
    try {
      const { user: newUser, generatedPassword } = await adminService.createInstructor({
        email: createEmail,
        name: createName,
      });
      setCreatedAccount({ email: newUser.email, generatedPassword });
      setCreateName("");
      setCreateEmail("");
      setLoadAttempt((attempt) => attempt + 1); // the new instructor should show up in the list
    } catch (err) {
      setCreateError(parseApiError(err).message);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleConfirmDeactivate() {
    if (!pendingDeactivation) return;
    setIsDeactivating(true);
    try {
      const updated = await adminService.deactivateUser(pendingDeactivation.id);
      setUsers((current) => current.map((u) => (u.id === updated.id ? updated : u)));
      setPendingDeactivation(null);
    } catch (err) {
      setListError(parseApiError(err).message);
      setPendingDeactivation(null);
    } finally {
      setIsDeactivating(false);
    }
  }

  async function handleReactivate(userId) {
    setActionError(null);
    setReactivatingId(userId);
    try {
      const updated = await adminService.reactivateUser(userId);
      setUsers((current) => current.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setActionError(parseApiError(err).message);
    } finally {
      setReactivatingId(null);
    }
  }

  async function handleRoleChange(userId, newRole) {
    setActionError(null);
    setChangingRoleId(userId);
    try {
      const updated = await adminService.changeUserRole(userId, newRole);
      setUsers((current) => current.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setActionError(parseApiError(err).message);
    } finally {
      setChangingRoleId(null);
    }
  }

  function handleSearchChange(event) {
    setSearch(event.target.value);
    setPage(1); // a changed search invalidates whatever page you were on
  }

  function handleRoleFilterChange(event) {
    setRoleFilter(event.target.value);
    setPage(1);
  }

  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

  return (
    <main className="admin-users">
      <h1>User Management</h1>
      <p className="admin-users__subtitle">
        Search accounts, deactivate one, or create a new instructor account.
      </p>

      <Card as="section" className="admin-users__section">
        <h2>
          <UserPlus className="admin-users__section-icon" size={18} aria-hidden="true" />
          Create an instructor account
        </h2>
        {createdAccount ? (
          <div className="admin-users__created-banner" role="status">
            <p>
              Account created for <strong>{createdAccount.email}</strong>.
            </p>
            <p>
              One-time password &mdash; won&rsquo;t be shown again, share it with them
              out-of-band:
            </p>
            <code className="admin-users__generated-password font-mono">
              {createdAccount.generatedPassword}
            </code>
          </div>
        ) : null}
        {createError ? (
          <p className="admin-users__banner" role="alert">
            {createError}
          </p>
        ) : null}
        <form className="admin-users__create-form" onSubmit={handleCreateSubmit}>
          <Input
            label="Name"
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            required
            disabled={isCreating}
          />
          <Input
            label="Email"
            type="email"
            value={createEmail}
            onChange={(event) => setCreateEmail(event.target.value)}
            required
            disabled={isCreating}
          />
          <Button type="submit" isLoading={isCreating}>
            Create instructor account
          </Button>
        </form>
      </Card>

      <Card as="section" className="admin-users__section">
        <h2>
          <Users className="admin-users__section-icon" size={18} aria-hidden="true" />
          All accounts
        </h2>
        <div className="admin-users__filters">
          <Input
            label="Search"
            placeholder="Name or email"
            value={search}
            onChange={handleSearchChange}
          />
          <label className="admin-users__role-filter">
            Role
            <select value={roleFilter} onChange={handleRoleFilterChange}>
              <option value="">All roles</option>
              <option value="learner">Learner</option>
              <option value="instructor">Instructor</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>

        {listError ? (
          <p className="admin-users__banner" role="alert">
            {listError}
          </p>
        ) : null}
        {actionError ? (
          <p className="admin-users__banner" role="alert">
            {actionError}
          </p>
        ) : null}

        {users === null ? (
          <div className="admin-users__skeleton" aria-hidden="true">
            <div className="admin-users__skeleton-row" />
            <div className="admin-users__skeleton-row" />
            <div className="admin-users__skeleton-row" />
          </div>
        ) : users.length === 0 ? (
          <p className="admin-users__empty">No accounts match this search.</p>
        ) : (
          <ul className="admin-users__list">
            {users.map((accountUser) => (
              <li key={accountUser.id} className="admin-users__row">
                <div className="admin-users__row-body">
                  <span className="admin-users__row-name">{accountUser.name}</span>
                  <span className="admin-users__row-email">{accountUser.email}</span>
                </div>
                <span className="admin-users__row-role">{accountUser.role}</span>
                <div className="admin-users__row-actions">
                  {/* Phase 8C: promotion/demotion is learner<->instructor only -- an admin row
                      gets no role control at all, matching the backend's own refusal to act on
                      an admin target through this endpoint. */}
                  {accountUser.role !== "admin" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      isLoading={changingRoleId === accountUser.id}
                      onClick={() =>
                        handleRoleChange(
                          accountUser.id,
                          accountUser.role === "learner" ? "instructor" : "learner"
                        )
                      }
                    >
                      {accountUser.role === "learner" ? "Make instructor" : "Make learner"}
                    </Button>
                  ) : null}
                  {accountUser.deactivatedAt ? (
                    <>
                      <span className="admin-users__status admin-users__status--deactivated">
                        Deactivated
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        isLoading={reactivatingId === accountUser.id}
                        onClick={() => handleReactivate(accountUser.id)}
                      >
                        Reactivate
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setPendingDeactivation(accountUser)}
                    >
                      Deactivate
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {pagination && pagination.total > pagination.limit ? (
          <div className="admin-users__pagination">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <span>
              Page {pagination.page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </Card>

      <Modal
        isOpen={pendingDeactivation !== null}
        onClose={() => setPendingDeactivation(null)}
        title="Deactivate this account?"
      >
        <p>
          {pendingDeactivation?.name} will be logged out immediately and won&rsquo;t be able to
          log back in.
        </p>
        <div className="admin-users__modal-actions">
          <Button type="button" variant="secondary" onClick={() => setPendingDeactivation(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            isLoading={isDeactivating}
            onClick={handleConfirmDeactivate}
          >
            Deactivate
          </Button>
        </div>
      </Modal>
    </main>
  );
}
