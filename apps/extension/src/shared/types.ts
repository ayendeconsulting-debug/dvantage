// ---------------------------------------------------------------------------
// D'Vantage Extension – Shared Types
//
// Core domain types shared across background, content scripts, and sidepanel.
//
// D10 additions:
//   - UserProfile.name → firstName + lastName (split happens API-side)
//   - SiteAdapter.fillFields return type: void → AutofillResult
//   - AutofillFieldKey – typed keys for profile→form field mapping
//   - AutofillPreviewField – one entry per fillable form field (sent in FORM_DETECTED)
//   - AutofillResult – returned by fillFields() to report what was filled
//   - ActiveForm – stored in chrome.storage.local[ACTIVE_FORM]
//   - CachedProfile – stored in chrome.storage.local[CACHED_PROFILE]
//
// D11 additions:
//   - SiteAdapter.observe() – optional hook for adapters that must detect
//     form appearance via MutationObserver rather than URL changes
//     (LinkedIn Easy Apply modal). Returns a cleanup function.
//
// D12 additions:
//   - ActiveForm.manualFields – file inputs requiring manual user upload.
//     Detected by adapters as FormField[type='file'], routed by content/index.ts
//     into this separate array. Never attempted by fillFields(); rendered in
//     AutofillPanel with a 📎 "Manual upload required" label.
//   - ActiveForm.fieldCount now includes manualFields.length (combined total).
// ---------------------------------------------------------------------------

/** A job posting extracted from a supported job board page. */
export interface ExtractedJob {
  title:       string | null;
  company:     string | null;
  location:    string | null;
  description: string;
  sourceUrl:   string;
  extractedAt: string; // ISO 8601
}

/**
 * A form field detected on an application page.
 * selector is a CSS selector that uniquely targets the input element.
 */
export interface FormField {
  name:        string;
  type:        'text' | 'email' | 'tel' | 'textarea' | 'select' | 'file' | 'unknown';
  label:       string | null;
  placeholder: string | null;
  required:    boolean;
  selector:    string;
}

/** ATS score result returned from POST /v1/extension/score. */
export interface ScoreResult {
  score:           number; // 0–100
  keywordGaps:     string[];
  semanticGaps:    string[];
  optimizationUrl: string; // deep link to web app optimize page
}

/**
 * User profile returned from GET /v1/extension/profile.
 *
 * D10: split name into firstName + lastName (API-side split).
 * This removes the split-on-space logic from every adapter and panel component.
 * Adapters that need a combined name field (e.g. Lever's single-name input)
 * concatenate: `${profile.firstName} ${profile.lastName}`.
 */
export interface UserProfile {
  firstName:        string;
  lastName:         string;
  email:            string;
  phone:            string | null;
  linkedinUrl:      string | null;
  summary:          string | null;
  /** Top 5 skills ordered by level: expert > advanced > intermediate > beginner. */
  topSkills:        string[];
  /** e.g. "Senior Backend Engineer @ Acme Corp" */
  currentRole:      string | null;
  defaultResumeId:  string | null;
  /** 1-hour presigned R2 URL – null when no complete resume exists. */
  defaultResumeUrl: string | null;
}

// ---------------------------------------------------------------------------
// Autofill types (D10)
// ---------------------------------------------------------------------------

/**
 * Typed keys that map a form field to the profile field that fills it.
 *
 * 'fullName'  – Lever-style single-name input; filled with "${firstName} ${lastName}".
 * All others  – direct UserProfile property lookup.
 */
export type AutofillFieldKey =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'linkedinUrl'
  | 'summary'
  | 'topSkills'
  | 'currentRole';

/**
 * A single fillable form field as detected by the site adapter.
 * Included in the FORM_DETECTED payload so AutofillPanel can render
 * the field-name + value preview without needing access to the DOM.
 */
export interface AutofillPreviewField {
  /** Human-readable label shown in the AutofillPanel preview. */
  label:      string;
  /** Maps this field to the value source in UserProfile. */
  profileKey: AutofillFieldKey;
  required:   boolean;
}

/**
 * Result returned by SiteAdapter.fillFields().
 * Used by the content script's EXECUTE_AUTOFILL handler to report
 * back to the background SW → side panel.
 */
export interface AutofillResult {
  /** Number of fields that were successfully written to the DOM. */
  filled:  number;
  /**
   * Human-readable labels of fields that were detected but skipped.
   * Reasons: profile value was null/empty, or field type is unsupported.
   * Rendered as "⚠ N fields need review" in AutofillPanel.
   */
  skipped: string[];
}

/**
 * Active form state stored in chrome.storage.local[ACTIVE_FORM].
 * Set when content script detects an application form.
 * Cleared (null) when navigating away from a form page.
 *
 * D12: fieldCount now includes both fillable + manual fields (combined total).
 *      manualFields added – file inputs that require manual user upload.
 */
export interface ActiveForm {
  /**
   * Total detected field count: fillableFields.length + manualFields.length.
   * Shown in the AutofillPanel header: "5 fields detected".
   */
  fieldCount:        number;
  /** Number of fields detected but not in the adapter's field map. */
  unknownFieldCount: number;
  /** URL of the page where the form was detected. */
  pageUrl:           string;
  /** Auto-fillable fields — shown with profile value preview in AutofillPanel. */
  fillableFields:    AutofillPreviewField[];
  /**
   * File upload fields — shown with 📎 "Manual upload required" label.
   * D12 addition. Always [] for adapters that don't emit type:'file' fields.
   * Defensive: consumers must treat undefined as [] for forward-compat.
   */
  manualFields:      Array<{ label: string; required: boolean }>;
}

/**
 * Cached autofill profile stored in chrome.storage.local[CACHED_PROFILE].
 * Background SW re-fetches GET /v1/extension/profile when age > 5 minutes.
 */
export interface CachedProfile {
  profile:  UserProfile;
  /** ISO 8601 timestamp of when this cache entry was written. */
  cachedAt: string;
}

// ---------------------------------------------------------------------------
// Extension bearer token (stored in chrome.storage.local)
// ---------------------------------------------------------------------------

/** Extension bearer token stored in chrome.storage.local. */
export interface StoredToken {
  token:     string;
  expiresAt: string; // ISO 8601 – sliding 30-day window, refreshed on each call
}

// ---------------------------------------------------------------------------
// Site adapter interface
// ---------------------------------------------------------------------------

/**
 * Site adapter interface – one file per supported job board.
 *
 * D10 change: fillFields now returns AutofillResult instead of void.
 *
 * D11 addition: observe() – optional hook for adapters that cannot rely
 * on URL changes to detect form open/close events (e.g. LinkedIn Easy Apply
 * modal, Indeed Apply modal). When present, the content script installs it
 * once at startup and calls the returned cleanup function on adapter change
 * or unload.
 */
export interface SiteAdapter {
  /** Detect and extract the job description from the current page. */
  detectJD: () => ExtractedJob | null;

  /**
   * Detect application form fields on the current page.
   *
   * Returns an empty array when no application form is present.
   * Called on every navigation event alongside detectJD().
   *
   * D12: file inputs (type='file') should be included in the return value.
   * The content script routes them to ActiveForm.manualFields automatically.
   * Adapters must NOT skip file inputs — they should emit them with type:'file'
   * so the panel can show the 📎 "Manual upload required" indicator.
   */
  detectForm: () => FormField[];

  /** Extract field values from the current form state. */
  extractFields: () => Record<string, string>;

  /**
   * Fill detected form fields with the provided profile data.
   *
   * Implementation requirements:
   *   - Use nativeInputValueSetter + dispatchEvent to trigger React/Vue reactivity.
   *   - Never call form.submit() or click submit buttons.
   *   - Skip fields whose profile value is null or empty – add to skipped[].
   *   - Skip file inputs (type='file') – browsers block programmatic value set.
   *   - Return filled count + skipped label array for panel display.
   */
  fillFields: (profile: UserProfile) => AutofillResult;

  /**
   * Optional: install a persistent observer for form state changes that
   * happen without a URL change (e.g. LinkedIn Easy Apply modal,
   * Indeed Apply modal).
   *
   * When present, the content script calls this once at startup.
   * The adapter calls onFormChange() whenever the form appears or disappears.
   * onFormChange maps to scheduleDetection() in the content script –
   * meaning runDetection() is triggered via the standard debounce path.
   *
   * Returns a cleanup function. The content script calls it if the adapter
   * changes (currently adapters are resolved once per page load, so cleanup
   * happens on page unload automatically via MutationObserver GC).
   */
  observe?: (onFormChange: () => void) => () => void;
}
