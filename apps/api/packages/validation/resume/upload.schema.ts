import { z } from 'zod';

export const ALLOWED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

export const RESUME_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const resumeUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_RESUME_MIME_TYPES),
  sizeBytes: z.number().int().min(1).max(RESUME_MAX_SIZE_BYTES),
});

export type ResumeUploadDto = z.infer<typeof resumeUploadSchema>;
