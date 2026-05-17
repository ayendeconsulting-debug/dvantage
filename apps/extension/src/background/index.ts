// ---------------------------------------------------------------------------
// D'Vantage — Service Worker (Manifest V3)
//
// Sets sidePanel open-on-action-click behavior so clicking the toolbar
// icon always opens the side panel (no popup fallback).
//
// D3: Adds onMessageExternal handler for the auth bridge.
//   - Receives DVANTAGE_EXT_TOKEN from dvantage.ca/extension/auth
//   - Validates sender origin (belt-and-suspenders on top of
//     externally_connectable in the manifest)
//   - Validates message shape before any storage write
//   - Stores token in chrome.storage.local and sends ack
//   - Returns true to keep message channel open for async sendResponse
//
// D4: Adds onMessage handler for AUTH_BRIDGE_TOKEN.
//   - Receives token from auth-bridge.ts content script via internal channel
//   - Content script bridge is used because externally_connectable is
//     unreliable across Chrome configurations — content scripts always
//     have full chrome.runtime access.
//   - Reuses the same storage write logic as onMessageExternal.
//   - Validates sender origin from sender.origin (content scripts on
//     dvantage.ca only — enforced by manifest content_scripts.matches).
// ---------------------------------------------------------------------------

import { STORAGE_KEYS }          from '../shared/constants';
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

const ALLOWED_ORIGIN = 'https://dvantage.ca' as const;

// ---------------------------------------------------------------------------
// Shared storage write — used by both message channels
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
        console.error(
          '[DVantage SW] Token storage write failed:',
          chrome.runtime.lastError.message,
        );
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

function isExtTokenMessage(msg: unknown): msg is ExternalToBackground {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'DVANTAGE_EXT_TOKEN') return false;
  const payload = m['payload'];
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p['token']     === 'string' && p['token'].length     > 0 &&
    typeof p['expiresAt'] === 'string' && p['expiresAt'].length > 0
  );
}

function isAuthBridgeMessage(msg: unknown): msg is Extract<ContentToBackground, { type: 'AUTH_BRIDGE_TOKEN' }> {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'AUTH_BRIDGE_TOKEN') return false;
  const payload = m['payload'];
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p['token']     === 'string' && p['token'].length     > 0 &&
    typeof p['expiresAt'] === 'string' && p['expiresAt'].length > 0
  );
}

// ---------------------------------------------------------------------------
// onMessageExternal — D3 auth bridge (externally_connectable channel)
//
// Belt-and-suspenders: kept alongside the content script bridge.
// Will activate if Chrome ever exposes chrome.runtime to the page correctly.
// ---------------------------------------------------------------------------

chrome.runtime.onMessageExternal.addListener(
  (
    message:      unknown,
    sender:       chrome.runtime.MessageSender,
    sendResponse: (response: ExternalAck) => void,
  ): true | undefined => {
    // — Origin guard —
    if (sender.origin !== ALLOWED_ORIGIN) {
      console.warn(
        '[DVantage SW] Rejected external message from unexpected origin:',
        sender.origin,
      );
      sendResponse({ ok: false, error: 'origin_not_allowed' });
      return undefined;
    }

    // — Type guard —
    if (!isExtTokenMessage(message)) {
      console.warn('[DVantage SW] Malformed external message received:', message);
      sendResponse({ ok: false, error: 'malformed_message' });
      return undefined;
    }

    storeExtensionToken(message.payload.token, message.payload.expiresAt, sendResponse);

    // Return true to keep the message channel open for the async sendResponse.
    return true;
  },
);

// ---------------------------------------------------------------------------
// onMessage — D4 content script bridge (internal channel)
//
// The auth-bridge.ts content script (injected on dvantage.ca/extension/auth)
// relays CustomEvents from the web page here via chrome.runtime.sendMessage.
// Content scripts always have chrome.runtime access regardless of
// externally_connectable configuration.
//
// We still validate sender.origin as defence-in-depth — the manifest
// content_scripts.matches already restricts injection to dvantage.ca.
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    message:      unknown,
    sender:       chrome.runtime.MessageSender,
    sendResponse: (response: ExternalAck) => void,
  ): true | undefined => {
    // Only handle AUTH_BRIDGE_TOKEN — ignore all other internal messages here.
    // Other handlers (scoring, autofill, etc.) will be added in later milestones.
    if (!isAuthBridgeMessage(message)) return undefined;

    // — Origin guard — content script should only run on dvantage.ca —
    if (sender.origin !== ALLOWED_ORIGIN) {
      console.warn(
        '[DVantage SW] Rejected auth bridge message from unexpected origin:',
        sender.origin,
      );
      sendResponse({ ok: false, error: 'origin_not_allowed' });
      return undefined;
    }

    console.log('[DVantage SW] Auth bridge token received via content script channel');
    storeExtensionToken(message.payload.token, message.payload.expiresAt, sendResponse);

    // Return true to keep the message channel open for the async sendResponse.
    return true;
  },
);

// ---------------------------------------------------------------------------

console.log('[DVantage SW] Service worker ready');
