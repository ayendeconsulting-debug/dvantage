// ---------------------------------------------------------------------------
// D'Vantage Extension — Shared Types
//
// Core domain types shared across background, content scripts, and sidepanel.
//
// D10 additions:
//   - UserProfile.name → firstName + lastName (split happens API-side)
//   - SiteAdapter.fillFields return type: void → AutofillResult
//   - AutofillFieldKey — typed keys for profile→form field mapping
//   - AutofillPreviewField — one entry per fillable form field (sent in FORM_DETECTED)
//   - AutofillResult — returned by fillFields() to report what was filled
//   - ActiveForm — stored in chrome.storage.local[ACTIVE_FORM]
//   - CachedProfile — stored in chrome.storage.local[CACHED_PROFILE]
//
// D11 additions:
//   - SiteAdapter.observe() — optional hook for adapters that must detect
//     form appearance via MutationObserver rather than URL changes
//
// D12 additions:
//   - ActiveForm.manualFields — file inputs requiring manual user upload
//   - ActiveForm.fieldCount now includes manualFields.length
//
// D13 Tier A additions:
//   - ProfileExperience, ProfileEducation, ProfileSkill, ProfileCertification
//     — sub-types for resume-sourced rich profile data
//   - UserProfile expanded with location, github, experience[], education[],
//     certifications[], allSkills[] — powered by the user's parsed resume
//   - AutofillFieldKey expanded: location, github, currentTitle, currentCompany,
//     university, degree, graduationYear
//   - SkippedField — replaces string in AutofillResult.skipped[].
//     Carries selector + fieldType so Tier B AI fill can write answers to the DOM.
//   - AutofillResult.skipped: string[] → SkippedField[]
// ---------------------------------------------------------------------------

/** A job posting extracted from a supported job board page. */
export interface ExtractedJob {
  title: string | null;
  company: string | null;
  location: string | null;
  description: string;
  sourceUrl: string;
  extractedAt: string; // ISO 8601
}

/**
 * A form field detected on an application page.
 * selector is a CSS selector that uniquely targets the input element.
 */
export interface FormField {
  name: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'file' | 'unknown';
  label: string | null;
  placeholder: string | null;
  required: boolean;
  selector: string;
}

/** ATS score result returned from POST /v1/extension/score. */
export interface ScoreResult {
  score: number; // 0–100
  keywordGaps: string[];
  semanticGaps: string[];
  optimizationUrl: string;
}

// ---------------------------------------------------------------------------
// Rich profile sub-types (D13 Tier A)
// ---------------------------------------------------------------------------

/**
 * A work experience entry from the user's parsed resume.
 * Maps from ResumeData.experience[] in @vantage/validation.
 */
export interface ProfileExperience {
  company: string;
  title: string;
  startDate: string;
  endDate: string | null;
  current: boolean;
  highlights: string[];
}

/**
 * An education entry from the user's parsed resume.
 * Maps from ResumeData.education[] in @vantage/validation.
 */
export interface ProfileEducation {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string | null;
  gpa: string | null;
}

/**
 * A skill entry from the user's parsed resume.
 * Maps from ResumeData.skills[] in @vantage/validation.
 */
export interface ProfileSkill {
  name: string;
  category: string; // 'technical' | 'soft' | 'language' | 'tool'
  level: string | null; // 'beginner' | 'intermediate' | 'advanced' | 'expert'
}

/**
 * A certification entry from the user's parsed resume.
 * Maps from ResumeData.certifications[] in @vantage/validation.
 */
export interface ProfileCertification {
  name: string;
  issuer: string;
  date: string | null;
}

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

/**
 * User profile returned from GET /v1/extension/profile.
 *
 * D10: split name into firstName + lastName (API-side split).
 * D13 Tier A: expanded with rich resume-sourced fields (location, github,
 *   experience[], education[], certifications[], allSkills[]).
 *   These power Tier A deterministic autofill of extended form fields,
 *   and Tier B AI fill of custom questions.
 */
export interface UserProfile {
  // ── Auth-sourced (users table) ──────────────────────────────────────────
  firstName: string;
  lastName: string;
  email: string;

  // ── User-profile-sourced (user_profiles table) ──────────────────────────
  phone: string | null;
  linkedinUrl: string | null;

  // ── Resume-sourced — contact section ────────────────────────────────────
  /** City/country/state as extracted from the resume contact section. */
  location: string | null;
  /** GitHub or portfolio URL from the resume contact section. */
  github: string | null;

  // ── Resume-sourced — derived convenience fields ──────────────────────────
  /** Professional summary or objective statement from the resume. */
  summary: string | null;
  /** Top 5 skills ordered by level: expert > advanced > intermediate > beginner. */
  topSkills: string[];
  /** e.g. "Senior Backend Engineer @ Acme Corp" from the most-recent/current role. */
  currentRole: string | null;

  // ── Resume-sourced — full arrays ─────────────────────────────────────────
  /** Full work experience array, most-recent first (resume convention). */
  experience: ProfileExperience[];
  /** Full education array, most-recent first. */
  education: ProfileEducation[];
  /** All certifications from the resume. */
  certifications: ProfileCertification[];
  /** Full skill list — all skills, not just top 5. */
  allSkills: ProfileSkill[];

  // ── Resume asset ─────────────────────────────────────────────────────────
  defaultResumeId: string | null;
  /** 1-hour presigned R2 URL — null when no complete resume exists. */
  defaultResumeUrl: string | null;
}

// ---------------------------------------------------------------------------
// Autofill types (D10, expanded D13 Tier A)
// ---------------------------------------------------------------------------

/**
 * Typed keys that map a form field to the profile source value.
 *
 * D13 Tier A additions:
 *   'location'       — profile.location (contact.location from resume)
 *   'github'         — profile.github (contact.github from resume)
 *   'currentTitle'   — profile.experience[0].title
 *   'currentCompany' — profile.experience[0].company
 *   'university'     — profile.education[0].institution
 *   'degree'         — profile.education[0].degree + field (combined)
 *   'graduationYear' — year extracted from profile.education[0].endDate
 */
export type AutofillFieldKey =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'linkedinUrl'
  | 'github'
  | 'location'
  | 'summary'
  | 'topSkills'
  | 'currentRole'
  | 'currentTitle'
  | 'currentCompany'
  | 'university'
  | 'degree'
  | 'graduationYear';

/**
 * A single fillable form field as detected by the site adapter.
 * Included in the FORM_DETECTED payload so AutofillPanel can render
 * the field-name + value preview without needing access to the DOM.
 */
export interface AutofillPreviewField {
  /** Human-readable label shown in the AutofillPanel preview. */
  label: string;
  /** Maps this field to the value source in UserProfile. */
  profileKey: AutofillFieldKey;
  required: boolean;
}

/**
 * A field that was detected but not filled — profile value was null/empty,
 * or the DOM element could not be found.
 *
 * D13 Tier A: replaces `string` in AutofillResult.skipped[].
 * Carries selector + fieldType so Tier B AI fill can write answers back to
 * the DOM after the AI endpoint generates an answer.
 *
 * selector conventions:
 *   Standard CSS selector (e.g. '#email', 'input[type="tel"]') — used with
 *   document.querySelector() in the content script.
 *   Label-based fallback (adapters that use label lookup): empty string ''.
 *   Tier B content script falls back to label-text search when selector is ''.
 */
export interface SkippedField {
  /** Human-readable label — shown in panel + sent to AI as context. */
  label: string;
  /** CSS selector to locate the input for DOM fill after AI answer. */
  selector: string;
  /** Input type — informs the AI whether to return a short answer or prose. */
  fieldType: 'text' | 'email' | 'tel' | 'textarea';
  required: boolean;
}

/**
 * Result returned by SiteAdapter.fillFields().
 *
 * D13 Tier A: skipped changed from string[] to SkippedField[].
 * skipped[] entries are candidates for Tier B AI fill — they have enough
 * context (selector, fieldType) for the content script to write AI answers
 * directly into the DOM.
 */
export interface AutofillResult {
  /** Number of fields successfully written to the DOM. */
  filled: number;
  /**
   * Fields that were detected but not filled because the profile value was
   * null/empty. Rendered as "⚠ N fields need review" in AutofillPanel.
   * Passed to Tier B AI fill as candidates for AI-generated answers.
   */
  skipped: SkippedField[];
}

/**
 * Active form state stored in chrome.storage.local[ACTIVE_FORM].
 * Set when content script detects an application form.
 * Cleared (null) when navigating away from a form page.
 *
 * D12: fieldCount now includes both fillable + manual fields (combined total).
 *      manualFields added — file inputs that require manual user upload.
 */
export interface ActiveForm {
  fieldCount: number;
  unknownFieldCount: number;
  pageUrl: string;
  fillableFields: AutofillPreviewField[];
  manualFields: Array<{ label: string; required: boolean }>;
}

/**
 * Cached autofill profile stored in chrome.storage.local[CACHED_PROFILE].
 * Background SW re-fetches GET /v1/extension/profile when age > 5 minutes.
 */
export interface CachedProfile {
  profile: UserProfile;
  cachedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Extension bearer token
// ---------------------------------------------------------------------------

export interface StoredToken {
  token: string;
  expiresAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Site adapter interface
// ---------------------------------------------------------------------------

export interface SiteAdapter {
  detectJD: () => ExtractedJob | null;
  detectForm: () => FormField[];
  extractFields: () => Record<string, string>;

  /**
   * Fill detected form fields with the provided profile data.
   *
   * D13 Tier A: returns AutofillResult with skipped: SkippedField[] instead
   * of string[]. Each SkippedField carries selector + fieldType for Tier B
   * AI fill — the content script uses these to write AI answers to the DOM.
   */
  fillFields: (profile: UserProfile) => AutofillResult;

  /**
   * Optional: install a persistent observer for form state changes that
   * happen without a URL change (e.g. LinkedIn Easy Apply modal,
   * Indeed Apply modal). Returns a cleanup function.
   */
  observe?: (onFormChange: () => void) => () => void;
}
