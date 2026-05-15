import { z } from 'zod';

export const updateApplicationSchema = z
  .object({
    company: z
      .string()
      .min(1, 'Company cannot be empty.')
      .max(200)
      .optional(),

    role: z
      .string()
      .min(1, 'Role cannot be empty.')
      .max(200)
      .optional(),

    location: z.string().max(200).nullable().optional(),

    status: z
      .enum(['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'])
      .optional(),

    appliedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'appliedDate must be in YYYY-MM-DD format.')
      .optional(),

    notes: z.string().max(5000).nullable().optional(),

    /** Pass null to unlink from a job description. */
    jobDescriptionId: z.string().nullable().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided.' },
  );

export type UpdateApplicationDto = z.infer<typeof updateApplicationSchema>;
