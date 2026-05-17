// ---------------------------------------------------------------------------
// D'Vantage — Service Worker (Manifest V3)
//
// D3: onMessageExternal — auth bridge via externally_connectable (kept).
// D4: onMessage — content script bridge (kept, inert).
// D4: cookies.onChanged — PRIMARY token delivery mechanism.
//   After the web app exchanges a session token, it sets a short-lived
//   dvantage_ext_pending cookie on dvantage.ca. Chrome fires onChanged
//   immediately, waking this SW regardless of its current lifecycle state.
//   The SW validates, stores, and deletes the cookie atomically.
//
//   Why cookies: direct chrome-extension:// navigation is blocked by Chrome
//   MV3 (ERR_BLOCKED_BY_CLIENT). Content script injection is unreliable in
//   unpacked dev extensions. Cookie-based handoff requires only the `cookies`
//   permission + host_permissions for dvantage.ca — both already present.
// ---------------------------------------------------------------------------

import { STORAGE_KEYS }                                               from '../shared/constants';
import type { ExternalToBackground, ExternalAck, ContentToBackground } from '../shared/messages';

// ---------------------------------------------------------------------------
// Side panel — open on toolbar action click
// ---------------------------------------------------------------------------

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err: unknown) => {
    console.error('[DVantage SW] sidePanel.setPanelBehavior failed:', err);
  });

chrome.runtime.onInstalled.addListener((details) => {
  console.log(
    '[DVantage SW] Installed — reason:',
    details.reason,
    '| version:',
    chrome.runtime.getManifest().version,
  );
});

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const ALLOWED_ORIGIN  = 'https://dvantage.ca' as const;
const PENDING_COOKIE  = 'dvantage_ext_pending' as const;

// ---------------------------------------------------------------------------
// Shared storage write
// ---------------------------------------------------------------------------

function storeExtensionToken(
  token:        string,
  expiresAt:    string,
  sendResponse: (response: ExternalAck) => void,
): void {
  chrome.storage.local.set(
    {
      [STORAGE_KEYS.EXTENSION_TOKEN]:  token,
      [STORAGE_KEYS.TOKEN_EXPIRES_AT]: expiresAt,
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error('[DVantage SW] Token storage write failed:', chrome.runtime.lastError.message);
        sendResponse({ ok: false, error: 'storage_write_failed' });
        return;
      }
      console.log('[DVantage SW] Extension token stored — expires:', expiresAt);
      sendResponse({ ok: true });
    },
  );
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Extension tokens are 64-char lowercase hex strings. */
function isValidToken(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** expiresAt must be a future ISO 8601 timestamp. */
function isValidExpiresAt(value: string): boolean {
  const ts = Date.parse(value);
  return !isNaN(ts) && ts > Date.now();
}

function isExtTokenMessage(msg: unknown): msg is ExternalToBackground {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'DVANTAGE_EXT_TOKEN') return false;
  const payload = m['payload'];
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p['token'] === 'string' && p['token'].length > 0 &&
         typeof p['expiresAt'] === 'string' && p['expiresAt'].length > 0;
}

function isAuthBridgeMessage(
  msg: unknown,
): msg is Extract<ContentToBackground, { type: 'AUTH_BRIDGE_TOKEN' }> {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'AUTH_BRIDGE_TOKEN') return false;
  const payload = m['payload'];
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p['token'] === 'string' && p['token'].length > 0 &&
         typeof p['expiresAt'] === 'string' && p['expiresAt'].length > 0;
}

// ---------------------------------------------------------------------------
// D4 PRIMARY — Cookie-based token handoff
//
// Fires when dvantage.ca sets the dvantage_ext_pending cookie.
// Chrome wakes the SW immediately on cookie change events — no polling.
//
// Cookie value format: {64-char-hex-token}|{ISO-8601-expiresAt}
//   Example: a1b2c3...f0|2026-06-17T12:00:00.000Z
//
// Security:
//   1. Cookie name must be exactly PENDING_COOKIE.
//   2. Cookie domain must be dvantage.ca.
//   3. Token must match /^[0-9a-f]{64}$/.
//   4. expiresAt must be a future ISO 8601 timestamp.
//   5. Cookie is deleted immediately after reading (one-time handoff).
// ---------------------------------------------------------------------------

chrome.cookies.onChanged.addListener((changeInfo) => {
  // Only act on creation/update — ignore deletions (we trigger those).
  if (changeInfo.removed) return;

  // Only our handoff cookie.
  if (changeInfo.cookie.name !== PENDING_COOKIE) return;

  // Domain guard — dvantage.ca cookies only.
  const domain = changeInfo.cookie.domain;
  if (domain !== 'dvantage.ca' && domain !== '.dvantage.ca') {
    console.warn('[DVantage SW] Unexpected cookie domain:', domain);
    return;
  }

  console.log('[DVantage SW] Pending token cookie detected — processing handoff');

  // Parse: value is "{token}|{expiresAt}"
  const raw            = changeInfo.cookie.value;
  const separatorIndex = raw.indexOf('|');

  if (separatorIndex === -1) {
    console.warn('[DVantage SW] Malformed pending cookie — no separator:', raw);
    return;
  }

  const token     = raw.slice(0, separatorIndex);
  const expiresAt = raw.slice(separatorIndex + 1);

  // Validate token format and expiry.
  if (!isValidToken(token)) {
    console.warn('[DVantage SW] Invalid token format in pending cookie');
    return;
  }
  if (!isValidExpiresAt(expiresAt)) {
    console.warn('[DVantage SW] Invalid or expired expiresAt in pending cookie:', expiresAt);
    return;
  }

  // Delete the cookie immediately — it is a one-time handoff signal.
  chrome.cookies.remove(
    { url: 'https://dvantage.ca', name: PENDING_COOKIE },
    () => {
      if (chrome.runtime.lastError) {
        console.error('[DVantage SW] Cookie removal failed:', chrome.runtime.lastError.message);
      } else {
        console.log('[DVantage SW] Pending cookie removed');
      }
    },
  );

  // Store the token.
  storeExtensionToken(token, expiresAt, (response) => {
    if (!response.ok) {
      console.error('[DVantage SW] Cookie handoff — storage failed:', response);
    } else {
      console.log('[DVantage SW] Cookie handoff complete — AuthGate will update via onChanged');
    }
  });
});

// ---------------------------------------------------------------------------
// D3 — onMessageExternal (externally_connectable, belt-and-suspenders)
// ---------------------------------------------------------------------------

chrome.runtime.onMessageExternal.addListener(
  (
    message:      unknown,
    sender:       chrome.runtime.MessageSender,
    sendResponse: (response: ExternalAck) => void,
  ): true | undefined => {
    if (sender.origin !== ALLOWED_ORIGIN) {
      sendResponse({ ok: false, error: 'origin_not_allowed' });
      return undefined;
    }
    if (!isExtTokenMessage(message)) {
      sendResponse({ ok: false, error: 'malformed_message' });
      return undefined;
    }
    storeExtensionToken(message.payload.token, message.payload.expiresAt, sendResponse);
    return true;
  },
);

// ---------------------------------------------------------------------------
// D4 — onMessage (content script bridge, inert under current architecture)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    message:      unknown,
    sender:       chrome.runtime.MessageSender,
    sendResponse: (response: ExternalAck) => void,
  ): true | undefined => {
    if (!isAuthBridgeMessage(message)) return undefined;
    if (sender.origin !== ALLOWED_ORIGIN) {
      sendResponse({ ok: false, error: 'origin_not_allowed' });
      return undefined;
    }
    storeExtensionToken(message.payload.token, message.payload.expiresAt, sendResponse);
    return true;
  },
);

// ---------------------------------------------------------------------------

console.log('[DVantage SW] Service worker ready');
