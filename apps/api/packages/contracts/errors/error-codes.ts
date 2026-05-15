/**
 * Vantage typed error code catalog.
 *
 * Every API error has a machine-readable code. The frontend maps these
 * to user-facing copy; the backend maps them to HTTP status codes.
 *
 * Convention: DOMAIN_NOUN_VERB or DOMAIN_CONDITION
 */

export const ErrorCode = {
  // ── Identity ──────────────────────────────────────────────────────────────
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_EMAIL_NOT_VERIFIED: 'AUTH_EMAIL_NOT_VERIFIED',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_MFA_REQUIRED: 'AUTH_MFA_REQUIRED',
  AUTH_MFA_INVALID_CODE: 'AUTH_MFA_INVALID_CODE',
  AUTH_SESSION_NOT_FOUND: 'AUTH_SESSION_NOT_FOUND',
  AUTH_RATE_LIMITED: 'AUTH_RATE_LIMITED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_EMAIL_TAKEN: 'USER_EMAIL_TAKEN',

  // ── Resume ────────────────────────────────────────────────────────────────
  RESUME_NOT_FOUND: 'RESUME_NOT_FOUND',
  RESUME_UPLOAD_FAILED: 'RESUME_UPLOAD_FAILED',
  RESUME_PARSE_FAILED: 'RESUME_PARSE_FAILED',
  RESUME_UNSUPPORTED_FORMAT: 'RESUME_UNSUPPORTED_FORMAT',
  RESUME_TOO_LARGE: 'RESUME_TOO_LARGE',
  RESUME_LIMIT_REACHED: 'RESUME_LIMIT_REACHED',

  // ── ATS / Matching ────────────────────────────────────────────────────────
  ATS_SCORE_NOT_FOUND: 'ATS_SCORE_NOT_FOUND',
  ATS_SCORE_IN_PROGRESS: 'ATS_SCORE_IN_PROGRESS',
  JOB_DESCRIPTION_NOT_FOUND: 'JOB_DESCRIPTION_NOT_FOUND',

  // ── AI ────────────────────────────────────────────────────────────────────
  AI_GENERATION_FAILED: 'AI_GENERATION_FAILED',
  AI_RATE_LIMITED: 'AI_RATE_LIMITED',
  AI_QUOTA_EXCEEDED: 'AI_QUOTA_EXCEEDED',

  // ── Billing ───────────────────────────────────────────────────────────────
  BILLING_SUBSCRIPTION_NOT_FOUND: 'BILLING_SUBSCRIPTION_NOT_FOUND',
  BILLING_PAYMENT_FAILED: 'BILLING_PAYMENT_FAILED',
  BILLING_PORTAL_ERROR: 'BILLING_PORTAL_ERROR',

  // ── Entitlements ──────────────────────────────────────────────────────────
  ENTITLEMENT_REQUIRED: 'ENTITLEMENT_REQUIRED',
  USAGE_QUOTA_EXCEEDED: 'USAGE_QUOTA_EXCEEDED',

  // ── Generic ───────────────────────────────────────────────────────────────
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
