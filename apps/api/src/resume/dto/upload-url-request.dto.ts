import { z } from 'zod';
import { resumeUploadSchema } from '@vantage/validation';

/**
 * Request body for POST /v1/resumes/upload-url
 *
 * Re-uses the shared resumeUploadSchema from @vantage/validation so the
 * same rules (MIME allow-list, 10 MB max) apply on both server and client.
 */
export const uploadUrlRequestSchema = resumeUploadSchema;
export type UploadUrlRequestDto = z.infer<typeof uploadUrlRequestSchema>;
