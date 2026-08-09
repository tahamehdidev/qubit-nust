-- Phase 7B.2 (cohort self-enrollment). Every cohort gets a short, human-typeable code a learner
-- can use to self-enroll (POST /cohorts/join) instead of an instructor adding students one by one
-- by UUID. New cohorts get a properly-generated code from utils/joinCode.js at creation time
-- (cohort.service.js); existing rows are backfilled here with an md5-derived placeholder so the
-- NOT NULL/UNIQUE constraints below can be added in the same migration -- an instructor can always
-- get a fresh one via the regenerate action if the backfilled value ever needs replacing.
ALTER TABLE cohort ADD COLUMN join_code TEXT;

UPDATE cohort
SET join_code = upper(substr(md5(random()::text || id::text), 1, 8))
WHERE join_code IS NULL;

ALTER TABLE cohort ALTER COLUMN join_code SET NOT NULL;
ALTER TABLE cohort ADD CONSTRAINT cohort_join_code_unique UNIQUE (join_code);
