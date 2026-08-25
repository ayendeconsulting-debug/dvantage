import { z } from 'zod';

export const createApplicationSchema = z.object({
  company: z
    .string()
    .min(1, 'Company is required.')
    .max(200, 'Company must be 200 characters or fewer.'),

  role: z.string().min(1, 'Role is required.').max(200, 'Role must be 200 characters or fewer.'),

  location: z.string().max(200, 'Location must be 200 characters or fewer.').optional(),

  status: z
    .enum(['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'])
    .default('applied'),

  /** ISO date string — YYYY-MM-DD. */
  appliedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'appliedDate must be in YYYY-MM-DD format.'),

  notes: z.string().max(5000, 'Notes must be 5000 characters or fewer.').optional(),

  /** UUID of an existing job_descriptions row. Optional. */
  jobDescriptionId: z.string().optional(),
});

export type CreateApplicationDto = z.infer<typeof createApplicationSchema>;
