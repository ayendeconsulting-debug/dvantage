// ---------------------------------------------------------------------------
// D'Vantage Extension — Auth Bridge Content Script
//
// Injected exclusively on: https://dvantage.ca/extension/auth*
// (enforced by manifest content_scripts.matches — not runtime-configurable)
//
// Purpose:
//   Bridge the CustomEvent channel (web page ↔ content script) to the
//   chrome.runtime.sendMessage channel (content script ↔ background SW).
//
//   Web pages cannot reliably call chrome.runtime.sendMessage via
//   externally_connectable on all Chrome versions and configurations.
//   Content scripts are extension code and always have full chrome.runtime
//   access — no externally_connectable binding required.
//
// Flow:
//   1. Web page dispatches CustomEvent('dvantage:ext:token', { detail: {token, expiresAt} })
//   2. This script relays it to BG SW via chrome.runtime.sendMessage (internal)
//   3. BG SW writes token to chrome.storage.local and acks { ok: true }
//   4. This script relays ack back via CustomEvent('dvantage:ext:ack', { detail: ack })
//   5. Web page receives ack → transitions to 'success' → window.close()
//
// Security:
//   - Manifest restricts injection to https://dvantage.ca/extension/auth*
//   - Background SW re-validates sender.origin as defence-in-depth
//   - Background SW validates message shape before any storage write
//   - { once: true } on the window listener prevents replay within page load
// ---------------------------------------------------------------------------

import type { ExternalAck } from '../shared/messages';

const TOKEN_EVENT = 'dvantage:ext:token' as const;
const ACK_EVENT = 'dvantage:ext:ack' as const;

interface TokenEventDetail {
  token: string;
  expiresAt: string;
}

function isTokenDetail(detail: unknown): detail is TokenEventDetail {
  if (typeof detail !== 'object' || detail === null) return false;
  const d = detail as Record<string, unknown>;
  return (
    typeof d['token'] === 'string' &&
    d['token'].length > 0 &&
    typeof d['expiresAt'] === 'string' &&
    d['expiresAt'].length > 0
  );
}

function dispatchAck(ack: ExternalAck): void {
  window.dispatchEvent(new CustomEvent(ACK_EVENT, { detail: ack }));
}

// { once: true } — prevent replay attacks within the same page session.
window.addEventListener(
  TOKEN_EVENT,
  (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;

    if (!isTokenDetail(detail)) {
      console.warn('[DVantage Bridge] Malformed token event detail — ignoring:', detail);
      dispatchAck({ ok: false, error: 'malformed_detail' });
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: 'AUTH_BRIDGE_TOKEN',
        payload: { token: detail.token, expiresAt: detail.expiresAt },
      },
      (response: ExternalAck) => {
        if (chrome.runtime.lastError) {
          // lastError must be read to suppress the unchecked error warning.
          const errMsg = chrome.runtime.lastError.message ?? 'unknown';
          console.error('[DVantage Bridge] sendMessage failed:', errMsg);
          dispatchAck({ ok: false, error: 'runtime_error' });
          return;
        }
        dispatchAck(response);
      },
    );
  },
  { once: true },
);

console.log('[DVantage Bridge] Auth bridge content script ready');
