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
// D4: Token expiry enforcement + refresh trigger added here.
// ---------------------------------------------------------------------------

import { STORAGE_KEYS }          from '../shared/constants';
import type { ExternalToBackground, ExternalAck } from '../shared/messages';

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
// External message handler — D3 auth bridge
//
// Security model:
//   1. manifest.externally_connectable.matches restricts which origins can
//      call sendMessage into this extension at the browser level.
//   2. We validate sender.origin here as an additional defence-in-depth
//      measure — protects against any future broadening of the manifest.
//   3. Message shape is fully type-guarded before any side effects.
// ---------------------------------------------------------------------------

const ALLOWED_ORIGIN = 'https://dvantage.ca' as const;

function isExtTokenMessage(msg: unknown): msg is ExternalToBackground {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'DVANTAGE_EXT_TOKEN') return false;
  const payload = m['payload'];
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p['token'] === 'string'     && p['token'].length > 0 &&
    typeof p['expiresAt'] === 'string' && p['expiresAt'].length > 0
  );
}

chrome.runtime.onMessageExternal.addListener(
  (
    message:      unknown,
    sender:       chrome.runtime.MessageSender,
    sendResponse: (response: ExternalAck) => void,
  ): true | undefined => {
    // ── Origin guard ──────────────────────────────────────────────────────
    if (sender.origin !== ALLOWED_ORIGIN) {
      console.warn(
        '[DVantage SW] Rejected external message from unexpected origin:',
        sender.origin,
      );
      sendResponse({ ok: false, error: 'origin_not_allowed' });
      return undefined;
    }

    // ── Type guard ────────────────────────────────────────────────────────
    if (!isExtTokenMessage(message)) {
      console.warn('[DVantage SW] Malformed external message received:', message);
      sendResponse({ ok: false, error: 'malformed_message' });
      return undefined;
    }

    const { token, expiresAt } = message.payload;

    // ── Storage write ─────────────────────────────────────────────────────
    // Store token and expiresAt together. expiresAt is read in D4 for
    // client-side expiry enforcement; it is ignored until then.
    chrome.storage.local.set(
      {
        [STORAGE_KEYS.EXTENSION_TOKEN]:    token,
        [STORAGE_KEYS.TOKEN_EXPIRES_AT]:   expiresAt,
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

    // Return true to keep the message channel open for the async sendResponse.
    // Without this, the callback port closes before the storage write completes.
    return true;
  },
);

// ---------------------------------------------------------------------------

console.log('[DVantage SW] Service worker ready');
