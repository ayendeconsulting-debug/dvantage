// ---------------------------------------------------------------------------
// Extension Auth — Response DTOs
//
// TypeScript interfaces only. Zod validation not required for these endpoints:
//   exchange → no request body (user comes from session, userAgent from header)
//   refresh  → no request body (token comes from Authorization header via guard)
//   revoke   → no request body (token comes from Authorization header via guard)
// ---------------------------------------------------------------------------

/**
 * Returned once from POST /v1/extension/auth/exchange.
 * The raw token is NEVER re-exposed after this response — store immediately
 * in chrome.storage.local[STORAGE_KEYS.EXTENSION_TOKEN].
 */
export interface ExchangeResponseDto {
  /** Raw 64-char hex bearer token. */
  token:     string;
  /** ISO 8601 timestamp — 30-day window from time of exchange. */
  expiresAt: string;
}

/**
 * Returned from POST /v1/extension/auth/refresh.
 * Contains the new expiresAt so the extension can update its local copy
 * without computing the window client-side. The server is the authoritative
 * clock — TOKEN_LIFETIME_MS is a server-side constant.
 */
export interface RefreshResponseDto {
  /** Updated ISO 8601 expiry timestamp — 30-day window from time of refresh. */
  expiresAt: string;
}

/** Returned from POST /v1/extension/auth/revoke. */
export interface ExtensionAuthAckDto {
  ok: true;
}
