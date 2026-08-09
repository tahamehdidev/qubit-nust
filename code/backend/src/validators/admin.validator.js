import { z } from "zod";

// No role field -- scoped to instructor accounts only (user.service.js's createInstructor()).
// Admin account creation stays a CLI-only action (scripts/create-admin.js), a deliberately
// smaller blast radius for the one action that grants platform-wide access.
export const CreateInstructorSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

// Phase 8C. "admin" is deliberately not a valid value here -- the enum itself is the first of two
// guards against using this endpoint to grant platform-wide access; user.service.js's
// changeUserRole() adds the second (refusing to act on a target who is already an admin), so
// promoting *to* or changing *an existing* admin both stay CLI-only, symmetric with instructor
// creation's own "smaller blast radius" reasoning.
export const ChangeUserRoleSchema = z.object({
  role: z.enum(["learner", "instructor"]),
});
