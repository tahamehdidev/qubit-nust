import { z } from "zod";

// instructorId is optional and admin-only in practice (02-api-contract.md §6.1) -- an instructor
// caller's own instructorId, if sent, is silently ignored at the service layer, not rejected here.
export const CreateCohortSchema = z.object({
  name: z.string().min(1),
  instructorId: z.string().uuid().optional(),
});

// regenerateJoinCode (Phase 7B.2) is a one-shot action flag, not a persisted field -- true
// replaces the cohort's join_code with a fresh one (revokes the old code); omitted/false leaves
// it untouched. Deliberately not settable to a caller-supplied value: a join code is always
// server-generated, never chosen.
export const UpdateCohortSchema = CreateCohortSchema.partial().extend({
  regenerateJoinCode: z.boolean().optional(),
});
