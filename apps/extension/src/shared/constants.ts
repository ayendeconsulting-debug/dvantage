// ---------------------------------------------------------------------------
// D'Vantage Extension — Shared Constants
// ---------------------------------------------------------------------------

/**
 * Extension version.
 *
 * MUST match `version` in src/manifest.ts. There is no build-time check
 * enforcing that — keep them in step by hand until the release pipeline
 * derives both from package.json.
 */
export const EXT_VERSION = '1.0.1' as const;

/** Base URL for all extension API calls. Never call third-party endpoints. */
export const API_BASE = 'https://api.dvantage.ca' as const;

/** Web app base URL — used for deep links (e.g. optimization CTA). */
export const APP_BASE = 'https://dvantage.ca' as const;

/** chrome.storage.local key names. Centralised to prevent typo mismatches. */
export const STORAGE_KEYS = {
  EXTENSION_TOKEN: 'dvantage_ext_token',
  /** ISO 8601 expiry timestamp for the extension token. */
  TOKEN_EXPIRES_AT: 'dvantage_ext_token_expires_at',
  /** Auth profile (name, email, plan) — populated by D5, used by ProfilePanel. */
  USER_PROFILE: 'dvantage_user_profile',
  /** Active job posting extracted by the content script. Shape: ExtractedJob. */
  ACTIVE_JOB: 'dvantage_active_job',
  /**
   * Cached ATS score for the most-recently-scored job posting.
   * Shape: { sourceUrl: string; result: ScoreResult }
   * Cache hit condition: stored sourceUrl === ACTIVE_JOB.sourceUrl.
   * Written by message-router after a successful POST /v1/extension/score.
   * Prevents redundant API calls on page refresh or side panel reopen.
   */
  CACHED_SCORE: 'dvantage_cached_score',
  /**
   * Active application form detected by the content script.
   * Shape: ActiveForm | null
   * Set by FORM_DETECTED handler; cleared (null) by FORM_CLEARED handler.
   * AutofillPanel reads this via storage.onChanged to decide visibility.
   */
  ACTIVE_FORM: 'dvantage_active_form',
  /**
   * Cached autofill profile from GET /v1/extension/profile.
   * Shape: CachedProfile { profile: UserProfile; cachedAt: string }
   * TTL: 5 minutes — background SW re-fetches if age > PROFILE_CACHE_TTL_MS.
   * Proactively invalidated by PATCH /v1/extension/profile (response replaces cache).
   */
  CACHED_PROFILE: 'dvantage_cached_profile',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Token sliding-window lifetime in milliseconds (30 days). */
export const TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Autofill profile cache TTL in milliseconds (5 minutes).
 * Background SW re-fetches GET /v1/extension/profile when:
 *   now() - cachedAt > PROFILE_CACHE_TTL_MS
 */
export const PROFILE_CACHE_TTL_MS = 5 * 60 * 1_000;

/** Optimization deep link path pattern. */
export const OPTIMIZATION_PATH = '/dashboard/jobs/:jobId/scores/:scoreId' as const;
