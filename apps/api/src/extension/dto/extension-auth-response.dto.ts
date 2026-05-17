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
  token: string;
  /** ISO timestamp — informational. Window slides on each refresh. */
  expiresAt: string;
}

/** Returned from POST /v1/extension/auth/refresh and /revoke. */
export interface ExtensionAuthAckDto {
  ok: true;
}
