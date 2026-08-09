-- Phase 7C.1 (admin user management). Soft-delete, mirroring cohort_enrollment's
-- status='removed' convention (migrations/014) -- a deactivated account is kept, never deleted,
-- so its historical attempts/progress/audit-log entries stay intact.
ALTER TABLE "user" ADD COLUMN deactivated_at TIMESTAMPTZ;
