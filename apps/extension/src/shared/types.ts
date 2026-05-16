// ---------------------------------------------------------------------------
// D'Vantage Extension — Shared Types
//
// Core domain types shared across background, content scripts, and sidepanel.
// Full implementations wired in Week 2–3 as each job is built.
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
 * Used to populate autofill fields and display user context in the side panel.
 */
export interface UserProfile {
  id:               string;
  name:             string;
  email:            string;
  phone:            string | null;
  linkedinUrl:      string | null;
  summary:          string | null;
  topSkills:        string[];
  currentRole:      string | null;
  defaultResumeId:  string | null;
  defaultResumeUrl: string | null; // signed R2 URL, 1-hour expiry
}

/** Extension bearer token stored in chrome.storage.local. */
export interface StoredToken {
  token:     string;
  expiresAt: string; // ISO 8601 — sliding 30-day window, refreshed on each call
}

/** Site adapter interface — one file per supported job board. */
export interface SiteAdapter {
  /** Detect and extract the job description from the current page. */
  detectJD: () => ExtractedJob | null;
  /** Detect application form fields on the current page. */
  detectForm: () => FormField[];
  /** Extract field values from the current form state. */
  extractFields: () => Record<string, string>;
  /** Fill detected form fields with the provided profile data. */
  fillFields: (profile: UserProfile) => void;
}
