// ---------------------------------------------------------------------------
// D'Vantage Extension — Shared Constants
// ---------------------------------------------------------------------------

export const EXT_VERSION = '1.0.0' as const;

/** Base URL for all extension API calls. Never call third-party endpoints. */
export const API_BASE = 'https://api.dvantage.ca' as const;

/** Web app base URL — used for deep links (e.g. optimization CTA). */
export const APP_BASE = 'https://dvantage.ca' as const;

/** chrome.storage.local key names. Centralised to prevent typo mismatches. */
export const STORAGE_KEYS = {
  EXTENSION_TOKEN:  'dvantage_ext_token',
  /** ISO 8601 expiry timestamp for the extension token. Read in D4. */
  TOKEN_EXPIRES_AT: 'dvantage_ext_token_expires_at',
  USER_PROFILE:     'dvantage_user_profile',
  ACTIVE_JOB:       'dvantage_active_job',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Token sliding-window lifetime in milliseconds (30 days). */
export const TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** Optimization deep link path pattern. */
export const OPTIMIZATION_PATH = '/dashboard/jobs/:jobId/scores/:scoreId' as const;
