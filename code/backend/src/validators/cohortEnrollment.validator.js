import { z } from "zod";

export const EnrollStudentSchema = z.object({
  userId: z.string().uuid(),
});

export const JoinCohortSchema = z.object({
  joinCode: z.string().min(1),
});

// Capped at 500 -- a generous roster size for a single CSV paste, while bounding the worst case
// of a sequential per-row DB round trip (cohortEnrollment.service.js's bulkEnroll()).
export const BulkEnrollSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(500),
});
