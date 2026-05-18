import { z } from 'zod';

// ---------------------------------------------------------------------------
// GET /v1/extension/profile — Response DTO
// ---------------------------------------------------------------------------

/**
 * Assembled autofill profile returned to the Chrome extension.
 *
 * Sources:
 *   users          → firstName, lastName, email
 *   user_profiles  → phone, linkedinUrl          (nullable — user may not have set them)
 *   resume_versions (MRU complete) → summary, skills, currentRole, defaultResumeUrl
 *
 * The extension caches this in chrome.storage.local[CACHED_PROFILE] with a
 * 5-minute TTL timestamp. Background SW reads the cache before hitting the API.
 * PATCH /v1/extension/profile returns a fresh copy, which the BG SW writes back
 * to storage — no separate cache-bust step required.
 */
export interface ExtensionProfileResponseDto {
  firstName:        string;
  lastName:         string;
  email:            string;
  phone:            string | null;
  linkedinUrl:      string | null;
  summary:          string | null;
  /** Top 5 skills ordered by level: expert > advanced > intermediate > beginner. */
  skills:           string[];
  /** e.g. "Senior Backend Engineer @ Acme Corp" — derived from experience[current=true] or [0]. */
  currentRole:      string | null;
  defaultResumeId:  string | null;
  /** 1-hour presigned R2 GET URL for the most-recent complete resume PDF. */
  defaultResumeUrl: string | null;
}

// ---------------------------------------------------------------------------
// PATCH /v1/extension/profile — Request DTO
// ---------------------------------------------------------------------------

export const ExtensionProfileUpdateSchema = z.object({
  /**
   * E.164 or free-form phone number. Pass null to explicitly clear the value.
   * Undefined = leave unchanged.
   */
  phone: z
    .string()
    .max(50, 'Phone must be 50 characters or fewer')
    .nullable()
    .optional(),

  /**
   * Full LinkedIn profile URL, e.g. https://www.linkedin.com/in/handle.
   * Pass null to explicitly clear. Undefined = leave unchanged.
   */
  linkedinUrl: z
    .string()
    .url('LinkedIn URL must be a valid URL (include https://)')
    .max(500, 'LinkedIn URL must be 500 characters or fewer')
    .nullable()
    .optional(),
});

export type ExtensionProfileUpdateDto = z.infer<typeof ExtensionProfileUpdateSchema>;
