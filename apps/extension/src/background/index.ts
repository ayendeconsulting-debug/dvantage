// ---------------------------------------------------------------------------
// D'Vantage — Service Worker (Manifest V3)
//
// D3: onMessageExternal — externally_connectable bridge (kept, belt-and-suspenders).
// D4: onMessage — content script bridge (kept, inert).
// D4: cookies.onChanged — cookie handoff attempt (kept, inert).
// D4 FINAL: tabs.onUpdated — PRIMARY token delivery.
//
//   When the user completes sign-in, the web app redirects to
//   dvantage.ca/extension/done. This SW detects that URL via
//   chrome.tabs.onUpdated, then calls the exchange endpoint directly.
//
//   Why this works:
//   - Chrome extensions with host_permissions make fetch() without CORS.
//   - credentials:'include' sends the api.dvantage.ca session cookie
//     (set by better-auth during sign-in) automatically.
//   - No web→extension communication required at all.
//   - tabs.onUpdated is guaranteed to wake the SW.
// ---------------------------------------------------------------------------

import { STORAGE_KEYS, API_BASE, APP_BASE }                           from '../shared/constants';
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

const ALLOWED_ORIGIN   = 'https://dvantage.ca' as const;
const DONE_URL_SUFFIX  = '/extension/done' as const;
const EXCHANGE_URL     = `${API_BASE}/v1/extension/auth/exchange` as const;

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
// Type guards
// ---------------------------------------------------------------------------

function isValidToken(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
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
// D4 FINAL — Direct exchange via tabs.onUpdated
//
// Fires when any tab completes navigation. We filter for our auth callback
// URL (dvantage.ca/extension/done). On match, we call the exchange endpoint
// directly using credentials:'include'. Chrome extensions with host_permissions
// are exempt from CORS and automatically include session cookies for the
// target domain in fetch() requests.
//
// The session cookie was set on api.dvantage.ca by better-auth during
// sign-in. credentials:'include' sends it in this SW fetch automatically.
// ---------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener(
  (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void => {
    // Only act when navigation is fully complete.
    if (changeInfo.status !== 'complete') return;

    // Only act on our auth callback URL.
    const url = tab.url ?? '';
    if (!url.includes(DONE_URL_SUFFIX)) return;

    console.log('[DVantage SW] Auth callback detected at:', url);

    void (async (): Promise<void> => {
      try {
        // Fetch the exchange endpoint directly.
        // - credentials:'include' sends api.dvantage.ca session cookies.
        // - Extension host_permissions exempt this from CORS.
        const response = await fetch(EXCHANGE_URL, {
          method:      'POST',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json' },
          body:        '{}',
        });

        if (!response.ok) {
          console.error('[DVantage SW] Exchange request failed — HTTP', response.status);
          return;
        }

        const data = await response.json() as unknown;

        if (
          typeof data !== 'object' || data === null ||
          typeof (data as Record<string, unknown>)['token']     !== 'string' ||
          typeof (data as Record<string, unknown>)['expiresAt'] !== 'string'
        ) {
          console.error('[DVantage SW] Invalid exchange response shape:', data);
          return;
        }

        const { token, expiresAt } = data as { token: string; expiresAt: string };

        if (!isValidToken(token)) {
          console.error('[DVantage SW] Exchange returned malformed token');
          return;
        }

        storeExtensionToken(token, expiresAt, (ack) => {
          if (!ack.ok) {
            console.error('[DVantage SW] Storage failed after exchange:', ack);
            return;
          }

          console.log('[DVantage SW] Direct exchange complete — closing auth tab');

          // Close the auth tab — AuthGate transitions via storage.onChanged.
          chrome.tabs.remove(tabId, () => {
            if (chrome.runtime.lastError) {
              // Tab may have already been closed — not fatal.
              console.warn('[DVantage SW] Tab close skipped:', chrome.runtime.lastError.message);
            }
          });
        });
      } catch (err: unknown) {
        console.error('[DVantage SW] Direct exchange threw:', err);
      }
    })();
  },
);

// ---------------------------------------------------------------------------
// D3 — onMessageExternal (belt-and-suspenders, kept)
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
// D4 — onMessage (content script bridge, inert)
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
