import { z } from 'zod';

// ---------------------------------------------------------------------------
// POST /v1/extension/applications — Request DTO
// ---------------------------------------------------------------------------

/**
 * Capture payload sent from the Chrome extension after a successful autofill.
 *
 * company and role are nullable because JD detection may have missed them
 * (e.g. LinkedIn modal before the job page fully hydrated). The API accepts
 * nulls and stores what it has — a partial record is better than no record.
 *
 * pageUrl is stored as a note so the user can navigate back to the original
 * posting from the web app dashboard.
 */
export const CaptureApplicationSchema = z.object({
  /** Company name as detected from the job page. Nullable. */
  company: z
    .string()
    .max(500, 'Company name must be 500 characters or fewer')
    .nullable(),

  /** Job title as detected from the job page. Nullable. */
  role: z
    .string()
    .max(500, 'Role title must be 500 characters or fewer')
    .nullable(),

  /** URL of the application form page at the time of autofill. */
  pageUrl: z
    .string()
    .url('pageUrl must be a valid URL')
    .max(2000, 'pageUrl must be 2 000 characters or fewer'),
});

export type CaptureApplicationDto = z.infer<typeof CaptureApplicationSchema>;

// ---------------------------------------------------------------------------
// POST /v1/extension/applications — Response DTO
// ---------------------------------------------------------------------------

export interface CaptureApplicationResponseDto {
  id:          string;
  company:     string;
  role:        string;
  status:      'applied';
  appliedDate: string; // ISO date string YYYY-MM-DD
}
