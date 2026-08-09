import { z } from "zod";

// No role field -- scoped to instructor accounts only (user.service.js's createInstructor()).
// Admin account creation stays a CLI-only action (scripts/create-admin.js), a deliberately
// smaller blast radius for the one action that grants platform-wide access.
export const CreateInstructorSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});
