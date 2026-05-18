// ---------------------------------------------------------------------------
// POST /v1/extension/score — Request DTO
// ---------------------------------------------------------------------------

import { z } from 'zod';

export const ExtensionScoreRequestSchema = z.object({
  /**
   * Raw job description text extracted by the content script.
   * Minimum 50 chars — prevents scoring against empty or stub pages.
   */
  jobDescription: z
    .string({ required_error: 'jobDescription is required' })
    .min(50, 'jobDescription must be at least 50 characters'),

  /**
   * Specific resume version ID to score against.
   *
   * Null (current default): server selects the most-recently-parsed complete
   * resume version for this user (MRU fallback).
   *
   * Non-null (future — populated by POST /v1/extension/classify): the ID of
   * the resume version linked to the matched Resume Category. When categories
   * ship, the extension will classify first, receive a resumeId, and pass it
   * here. This endpoint never needs to know about categories — zero rework.
   */
  resumeId: z
    .string()
    .uuid('resumeId must be a valid UUID')
    .nullable(),
});

export type ExtensionScoreRequestDto = z.infer<typeof ExtensionScoreRequestSchema>;
