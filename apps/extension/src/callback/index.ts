// ---------------------------------------------------------------------------
// D'Vantage Extension — Auth Callback Script
//
// Entry point for callback.html. Runs as extension code — full
// chrome.runtime and chrome.storage access is unconditionally available.
//
// This page is the destination after the web app completes the token
// exchange. The web app navigates the auth tab here via:
//   window.location.href = `chrome-extension://${extensionId}/callback.html
//                           #token=${token}&expiresAt=${expiresAt}`
//
// Flow:
//   1. Parse token + expiresAt from URL hash (never sent to any server)
//   2. Write to chrome.storage.local
//   3. Show success UI
//   4. Close the tab after 1.5 s
//   5. Side panel's chrome.storage.onChanged listener (D3) picks up the
//      new token and transitions AuthGate to the "Connected" state.
//
// Security:
//   • web_accessible_resources.matches restricts navigation to this page
//     to https://dvantage.ca/* only (enforced by Chrome manifest).
//   • Token and expiresAt are validated for presence before any write.
//   • Hash values are URL-decoded only — no eval, no innerHTML with user data.
// ---------------------------------------------------------------------------

import { STORAGE_KEYS } from '../shared/constants';

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const root = document.getElementById('root')!;

const DVantageMark = `
  <svg viewBox="0 0 32 24" width="40" height="30" fill="none" style="margin-bottom:24px;flex-shrink:0">
    <path d="M 2 20 L 11 4 L 30 20" stroke="#3b82f6" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/>
  </svg>
`;

function renderSuccess(): void {
  root.innerHTML = `
    ${DVantageMark}
    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" style="margin-bottom:16px;flex-shrink:0">
      <circle cx="12" cy="12" r="11" stroke="#22c55e" stroke-width="1.5"/>
      <path d="M7.5 12l3 3 6-6.5" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <p style="font-size:14px;font-weight:500;color:#f1f5f9;margin:0">Connected! Closing this tab&hellip;</p>
  `;
}

function renderError(message: string): void {
  root.innerHTML = `
    ${DVantageMark}
    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" style="margin-bottom:16px;flex-shrink:0">
      <circle cx="12" cy="12" r="11" stroke="#ef4444" stroke-width="1.5"/>
      <path d="M12 8v5M12 15.5h.01" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <p style="font-size:14px;font-weight:500;color:#f1f5f9;margin:0 0 8px">Something went wrong</p>
    <p style="font-size:13px;color:#94a3b8;margin:0;line-height:1.55">${message}</p>
    <p style="font-size:12px;color:#64748b;margin:16px 0 0">Close this tab and try signing in again from the D&apos;Vantage extension.</p>
  `;
}

// ---------------------------------------------------------------------------
// Hash parser — token and expiresAt are URL-encoded in the fragment
// ---------------------------------------------------------------------------

interface CallbackParams {
  token: string;
  expiresAt: string;
}

function parseHashParams(): CallbackParams | null {
  const hash = window.location.hash.slice(1); // strip leading #
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const token = params.get('token');
  const expiresAt = params.get('expiresAt');

  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    typeof expiresAt !== 'string' ||
    expiresAt.length === 0
  ) {
    return null;
  }

  return { token, expiresAt };
}

// ---------------------------------------------------------------------------
// Main — runs immediately when the page loads
// ---------------------------------------------------------------------------

const params = parseHashParams();

if (!params) {
  console.error('[DVantage Callback] Missing or malformed hash params');
  renderError('Invalid callback parameters. Please close this tab and try signing in again.');
} else {
  chrome.storage.local.set(
    {
      [STORAGE_KEYS.EXTENSION_TOKEN]: params.token,
      [STORAGE_KEYS.TOKEN_EXPIRES_AT]: params.expiresAt,
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error(
          '[DVantage Callback] Storage write failed:',
          chrome.runtime.lastError.message,
        );
        renderError('Failed to save your connection. Please close this tab and try again.');
        return;
      }

      console.log('[DVantage Callback] Token stored successfully — expires:', params.expiresAt);
      renderSuccess();

      // Tab was opened by chrome.tabs.create — window.close() is permitted.
      setTimeout(() => {
        window.close();
      }, 1_500);
    },
  );
}
