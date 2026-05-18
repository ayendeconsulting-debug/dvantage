import { z } from 'zod';

// ---------------------------------------------------------------------------
// Rich profile sub-types (D13 Tier A)
// Mirrored in apps/extension/src/shared/types.ts as Profile* interfaces.
// ---------------------------------------------------------------------------

export interface ExperienceEntry {
  company:    string;
  title:      string;
  startDate:  string;
  endDate:    string | null;
  current:    boolean;
  highlights: string[];
}

export interface EducationEntry {
  institution: string;
  degree:      string;
  field:       string;
  startDate:   string;
  endDate:     string | null;
  gpa:         string | null;
}

export interface SkillEntry {
  name:     string;
  category: string;
  level:    string | null;
}

export interface CertificationEntry {
  name:   string;
  issuer: string;
  date:   string | null;
}

// ---------------------------------------------------------------------------
// GET /v1/extension/profile — Response DTO
// ---------------------------------------------------------------------------

/**
 * Assembled autofill profile returned to the Chrome extension.
 *
 * Sources:
 *   users          → firstName, lastName, email
 *   user_profiles  → phone, linkedinUrl
 *   resume_versions (MRU complete) → all resume-sourced fields
 *
 * D13 Tier A:
 *   - Renamed skills → topSkills (aligns with UserProfile in extension)
 *   - Added contact-sourced fields: location, github
 *   - Added full resume arrays: experience[], education[], certifications[],
 *     allSkills[] — powers deterministic Tier A autofill of extended form
 *     fields, and provides full context for Tier B AI fill.
 */
export interface ExtensionProfileResponseDto {
  // ── Auth-sourced ──────────────────────────────────────────────────────────
  firstName:        string;
  lastName:         string;
  email:            string;

  // ── User-profile-sourced ──────────────────────────────────────────────────
  phone:            string | null;
  linkedinUrl:      string | null;

  // ── Resume-sourced: contact ───────────────────────────────────────────────
  /** Location as extracted from resume contact section (city, country, etc.). */
  location:         string | null;
  /** GitHub or portfolio URL from resume contact section. */
  github:           string | null;

  // ── Resume-sourced: derived convenience fields ────────────────────────────
  summary:          string | null;
  /** Top 5 skills ordered by level (expert > advanced > intermediate > beginner). */
  topSkills:        string[];        // D13: renamed from 'skills'
  currentRole:      string | null;

  // ── Resume-sourced: full arrays (D13 Tier A) ─────────────────────────────
  experience:       ExperienceEntry[];
  education:        EducationEntry[];
  certifications:   CertificationEntry[];
  /** All skills from the resume — not filtered to top 5. */
  allSkills:        SkillEntry[];

  // ── Resume asset ──────────────────────────────────────────────────────────
  defaultResumeId:  string | null;
  /** 1-hour presigned R2 GET URL for the most-recent complete resume. */
  defaultResumeUrl: string | null;
}

// ---------------------------------------------------------------------------
// PATCH /v1/extension/profile — Request DTO
// ---------------------------------------------------------------------------

export const ExtensionProfileUpdateSchema = z.object({
  phone: z
    .string()
    .max(50, 'Phone must be 50 characters or fewer')
    .nullable()
    .optional(),

  linkedinUrl: z
    .string()
    .url('LinkedIn URL must be a valid URL (include https://)')
    .max(500, 'LinkedIn URL must be 500 characters or fewer')
    .nullable()
    .optional(),
});

export type ExtensionProfileUpdateDto = z.infer<typeof ExtensionProfileUpdateSchema>;
