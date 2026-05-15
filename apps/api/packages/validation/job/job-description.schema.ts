import { z } from 'zod';

export const jobDescriptionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  company: z.string().min(1).max(255).optional(),
  content: z.string().min(50).max(50_000),
  url: z.string().url().optional(),
});

export type JobDescriptionDto = z.infer<typeof jobDescriptionSchema>;
