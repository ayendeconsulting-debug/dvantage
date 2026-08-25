/**
 * Extension auth API client
 *
 * Typed fetch wrapper for the extension token exchange endpoint.
 * The exchange endpoint requires an active better-auth session cookie — this
 * call must be made from the web app context (where the cookie exists), not
 * from the extension itself. The web app acts as the trusted broker.
 *
 * Uses credentials: 'include' so the session cookie is forwarded to the API.
 */

const API_BASE =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Response type — mirrors ExchangeResponseDto on the API
// ---------------------------------------------------------------------------

export interface ExchangeResponse {
  /** Raw 64-char hex bearer token. Store as-is in chrome.storage.local. */
  token: string;
  /** ISO 8601 timestamp — 30-day sliding window from time of exchange. */
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// API function
// ---------------------------------------------------------------------------

/**
 * Exchange the current web session for a long-lived extension bearer token.
 *
 * Requires an active better-auth session cookie. Throws an Error with a
 * human-readable message on any non-2xx response so callers can surface it
 * directly in the UI without further transformation.
 */
export async function exchangeExtensionToken(): Promise<ExchangeResponse> {
  const res = await fetch(`${API_BASE}/v1/extension/auth/exchange`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!res.ok) {
    let message = `Extension token exchange failed (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string; message?: string };
      message = body.detail ?? body.message ?? message;
    } catch {
      /* ignore JSON parse errors — use the fallback message */
    }
    throw new Error(message);
  }

  return res.json() as Promise<ExchangeResponse>;
}
