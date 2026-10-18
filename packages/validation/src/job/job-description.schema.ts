import { z } from 'zod';

// ---------------------------------------------------------------------------
// Create — all metadata optional, content required
// ---------------------------------------------------------------------------

export const createJobDescriptionSchema = z.object({
  /** Optional label for the role, e.g. "Senior Backend Engineer". */
  title: z.string().min(1).max(255).optional(),

  /** Optional company name, e.g. "Stripe". */
  company: z.string().min(1).max(255).optional(),

  /**
   * Raw job description text as pasted by the user.
   * 50 char minimum ensures meaningful content (not a title alone).
   * 50 000 char maximum covers even the most verbose JDs.
   */
  content: z.string().min(50, 'Job description must be at least 50 characters.').max(50_000),

  /** Optional source URL of the job posting. */
  url: z.string().url('Must be a valid URL.').optional(),
});

export type CreateJobDescriptionDto = z.infer<typeof createJobDescriptionSchema>;

// ---------------------------------------------------------------------------
// Update — metadata only. Content is intentionally excluded:
// changing the JD content invalidates any existing ATS scores, so the correct
// UX is to delete and recreate rather than silently patch.
// ---------------------------------------------------------------------------

export const updateJobDescriptionSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    company: z.string().min(1).max(255).optional(),
    url: z.string().url('Must be a valid URL.').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update.',
  });

export type UpdateJobDescriptionDto = z.infer<typeof updateJobDescriptionSchema>;
