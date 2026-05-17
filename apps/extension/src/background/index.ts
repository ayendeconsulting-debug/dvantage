// ---------------------------------------------------------------------------
// D'Vantage — Service Worker (Manifest V3)
//
// D4: tabs.onUpdated — PRIMARY token delivery.
//   Detects /extension/done URL, calls exchange endpoint directly.
//
// D5: REQUEST_REFRESH handler.
//   When AuthGate detects TOKEN_EXPIRES_AT is within 7 days, it sends
//   REQUEST_REFRESH via chrome.runtime.sendMessage. This SW calls
//   POST /v1/extension/auth/refresh with the current Bearer token.
//   On 200: writes new TOKEN_EXPIRES_AT to storage (AuthGate.onChanged fires).
//   On 401/error: clears both token keys (AuthGate transitions to unauthed).
//
// D6: Message router wired in.
//   All messages NOT handled by the auth handlers below are delegated to
//   background/message-router.ts. See that file for the full routing table.
// ---------------------------------------------------------------------------

import { STORAGE_KEYS, API_BASE }                                     from '../shared/constants';
import type { ExternalToBackground, ExternalAck, ContentToBackground } from '../shared/messages';
import { routeMessage }                                                from './message-router';

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
const DONE_URL_SUFFIX = '/extension/done'      as const;
const EXCHANGE_URL    = `${API_BASE}/v1/extension/auth/exchange` as const;
const REFRESH_URL     = `${API_BASE}/v1/extension/auth/refresh`  as const;

// ---------------------------------------------------------------------------
// Shared storage helpers
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

/** Clear both token keys — called on 401 from refresh or on explicit revoke. */
function clearTokenStorage(reason: string): void {
  chrome.storage.local.remove(
    [STORAGE_KEYS.EXTENSION_TOKEN, STORAGE_KEYS.TOKEN_EXPIRES_AT],
    () => {
      console.log('[DVantage SW] Token storage cleared —', reason);
    },
  );
}

// ---------------------------------------------------------------------------
// Validation helpers
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

function isRequestRefresh(msg: unknown): boolean {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as Record<string, unknown>)['type'] === 'REQUEST_REFRESH'
  );
}

// ---------------------------------------------------------------------------
// D4 PRIMARY — tabs.onUpdated direct exchange
// ---------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener(
  (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void => {
    if (changeInfo.status !== 'complete') return;
    const url = tab.url ?? '';
    if (!url.includes(DONE_URL_SUFFIX)) return;

    console.log('[DVantage SW] Auth callback detected at:', url);

    void (async (): Promise<void> => {
      try {
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
          chrome.tabs.remove(tabId, () => {
            if (chrome.runtime.lastError) {
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
// onMessage — auth handlers + message router delegate (D6)
//
// Priority order (first match wins):
//   1. AUTH_BRIDGE_TOKEN  — relay from auth-bridge content script
//   2. REQUEST_REFRESH    — token sliding-window refresh (D5)
//   3. routeMessage()     — all other messages (D6+): JOB_DETECTED,
//                           REQUEST_SCORE, REQUEST_AUTOFILL, …
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    message:      unknown,
    sender:       chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): true | undefined => {

    // ── 1. AUTH_BRIDGE_TOKEN ───────────────────────────────────────────────
    if (isAuthBridgeMessage(message)) {
      // Auth bridge (inert under current architecture but kept).
      if (sender.origin !== ALLOWED_ORIGIN) {
        sendResponse({ ok: false, error: 'origin_not_allowed' });
        return undefined;
      }
      storeExtensionToken(
        message.payload.token,
        message.payload.expiresAt,
        sendResponse as (r: ExternalAck) => void,
      );
      return true;
    }

    // ── 2. REQUEST_REFRESH ─────────────────────────────────────────────────
    if (isRequestRefresh(message)) {
      // Read current token then call the refresh endpoint.
      void (async (): Promise<void> => {
        const result = await new Promise<Record<string, unknown>>((resolve) => {
          chrome.storage.local.get(
            [STORAGE_KEYS.EXTENSION_TOKEN, STORAGE_KEYS.TOKEN_EXPIRES_AT],
            resolve as (items: Record<string, unknown>) => void,
          );
        });

        const token = result[STORAGE_KEYS.EXTENSION_TOKEN];

        if (typeof token !== 'string' || token.length === 0) {
          console.warn('[DVantage SW] REQUEST_REFRESH — no token in storage, skipping');
          sendResponse({ ok: false, error: 'no_token' });
          return;
        }

        try {
          const response = await fetch(REFRESH_URL, {
            method:  'POST',
            body: '{}',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${token}`,
            },
          });

          if (response.status === 401) {
            console.warn('[DVantage SW] Refresh returned 401 — token revoked or expired on server');
            clearTokenStorage('401 on refresh');
            sendResponse({ ok: false, error: 'unauthorized' });
            return;
          }

          if (!response.ok) {
            console.error('[DVantage SW] Refresh failed — HTTP', response.status);
            sendResponse({ ok: false, error: `http_${response.status}` });
            return;
          }

          const data = await response.json() as unknown;

          if (
            typeof data !== 'object' || data === null ||
            typeof (data as Record<string, unknown>)['expiresAt'] !== 'string'
          ) {
            console.error('[DVantage SW] Invalid refresh response shape:', data);
            sendResponse({ ok: false, error: 'invalid_response' });
            return;
          }

          const { expiresAt } = data as { expiresAt: string };

          // Write new expiresAt — AuthGate.onChanged will re-evaluate.
          chrome.storage.local.set(
            { [STORAGE_KEYS.TOKEN_EXPIRES_AT]: expiresAt },
            () => {
              if (chrome.runtime.lastError) {
                console.error('[DVantage SW] ExpiresAt write failed:', chrome.runtime.lastError.message);
                sendResponse({ ok: false, error: 'storage_write_failed' });
                return;
              }
              console.log('[DVantage SW] Token refreshed — new expiresAt:', expiresAt);
              sendResponse({ ok: true, expiresAt });
            },
          );
        } catch (err: unknown) {
          console.error('[DVantage SW] Refresh threw:', err);
          sendResponse({ ok: false, error: 'network_error' });
        }
      })();

      return true; // async sendResponse
    }

    // ── 3. Message router — JOB_DETECTED, REQUEST_SCORE, etc. (D6+) ───────
    const routerResult = routeMessage(message, sender, sendResponse);
    return routerResult === true ? true : undefined;
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

console.log('[DVantage SW] Service worker ready');
