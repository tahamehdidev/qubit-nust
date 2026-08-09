import { z } from "zod";

// role is never editable through this endpoint (02-api-contract.md §2.8) -- not included here at
// all, so there's no field to strip; email isn't part of the documented update surface either.
export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100),
});

// Phase 8D: self-service password change while logged in. currentPassword has no length floor of
// its own (min(1) only) -- the account's actual complexity requirement was already enforced once,
// at signup; this schema just needs a non-empty value to compare, not a fresh rule.
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
