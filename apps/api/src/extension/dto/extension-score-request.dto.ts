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
    .min(50, 'jobDescription must be at least 50 characters')
    // Upper bound must match the web schema (packages/validation
    // job-description.schema.ts caps content at 50_000). Without it, this
    // endpoint accepted anything up to Fastify's 1MB body limit and forwarded
    // it verbatim to Claude — roughly 250k input tokens, ~$0.57 of spend, per
    // request, on a route that had no quota check and no rate limit.
    .max(50_000, 'jobDescription must be 50,000 characters or fewer'),

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
  resumeId: z.string().uuid('resumeId must be a valid UUID').nullable(),
});

export type ExtensionScoreRequestDto = z.infer<typeof ExtensionScoreRequestSchema>;
