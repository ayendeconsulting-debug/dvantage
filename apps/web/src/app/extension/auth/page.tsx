'use client';

// ---------------------------------------------------------------------------
// D'Vantage — Extension auth callback page
//
// URL: /extension/auth?return=chrome-extension://<extensionId>
//
// Next.js 15 requires useSearchParams() to be inside a Suspense boundary.
// Pattern: ExtensionAuthPage (outer, exported) wraps ExtensionAuthContent
// (inner, consumes useSearchParams) in <Suspense>. The fallback renders the
// same spinner/mark shown during the 'checking' state so there is no flash.
//
// Flow (inside ExtensionAuthContent):
//   1. Session loading  → spinner
//   2. Not logged in    → redirect to /auth/sign-in (preserving return param)
//   3. Logged in        → POST /v1/extension/auth/exchange
//   4. Exchange success → CustomEvent('dvantage:ext:token') dispatched to window
//   5. auth-bridge.ts content script relays to BG SW via chrome.runtime.sendMessage
//   6. Ack received     → window.close()
//   7. Any failure      → error state + retry CTA
//
// Token delivery mechanism (D4):
//   Direct chrome.runtime.sendMessage via externally_connectable was unreliable
//   (chrome.runtime.runtime returned undefined in production — D4 diagnostic).
//   Replaced with a CustomEvent bridge: the extension injects auth-bridge.ts
//   as a content script on this page. Content scripts always have chrome.runtime
//   access regardless of externally_connectable configuration.
//
// Security:
//   • return param validated — must be chrome-extension:// protocol.
//   • callbackURL redirect validated — relative paths only (no open redirect).
//   • Background SW re-validates sender.origin as defence-in-depth.
//   • 8-second timeout on ack prevents hung UI if extension is unresponsive.
// ---------------------------------------------------------------------------

import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams }                                  from 'next/navigation';
import { useSession }                                                   from '@/lib/auth-client';
import { exchangeExtensionToken }                                       from '@/lib/api/extension';

// ---------------------------------------------------------------------------
// CustomEvent channel constants
// ---------------------------------------------------------------------------

const TOKEN_EVENT   = 'dvantage:ext:token' as const;
const ACK_EVENT     = 'dvantage:ext:ack'   as const;
const ACK_TIMEOUT   = 8_000; // ms — time to wait for content script ack

// ---------------------------------------------------------------------------
// Ack type — mirrors ExternalAck from the extension
// ---------------------------------------------------------------------------

type BridgeAck = { ok: true } | { ok: false; error?: string };

function isBridgeAck(value: unknown): value is BridgeAck {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as Record<string, unknown>)['ok'] === 'boolean';
}

// ---------------------------------------------------------------------------
// Page state machine
// ---------------------------------------------------------------------------

type PageState =
  | 'checking'    // Session still loading
  | 'redirecting' // Not logged in — going to /auth/sign-in
  | 'exchanging'  // Calling POST /v1/extension/auth/exchange
  | 'sending'     // Dispatching CustomEvent + awaiting ack
  | 'success'     // Ack received — tab closing
  | 'error';      // Show message + optional retry

const STATUS_LABEL: Record<PageState, string> = {
  checking:    'Loading\u2026',
  redirecting: 'Redirecting to sign in\u2026',
  exchanging:  'Connecting your extension\u2026',
  sending:     'Finalising connection\u2026',
  success:     'Connected! Closing this tab\u2026',
  error:       'Something went wrong',
};

const LOADING_STATES = new Set<PageState>([
  'checking',
  'redirecting',
  'exchanging',
  'sending',
]);

// ---------------------------------------------------------------------------
// Shared mark — used in both fallback and main content
// ---------------------------------------------------------------------------

function DVantageMark() {
  return (
    <svg
      viewBox="0 0 32 24"
      width="40"
      height="30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="D\u2019Vantage"
      style={{ marginBottom: '24px', flexShrink: 0 }}
    >
      <path
        d="M 2 20 L 11 4 L 30 20"
        stroke="var(--vt-brand-500)"
        strokeWidth="3"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Suspense fallback — mirrors the 'checking' state so there is no flash
// ---------------------------------------------------------------------------

function LoadingFallback() {
  return (
    <div style={styles.page}>
      <DVantageMark />
      <style>{`@keyframes vt-ext-auth-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.spinner} aria-hidden="true" />
      <p style={styles.statusLabel}>Loading\u2026</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner content — consumes useSearchParams (must be inside Suspense)
// ---------------------------------------------------------------------------

function ExtensionAuthContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();

  const [pageState, setPageState] = useState<PageState>('checking');
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);

  // Prevents double-invocation in React Strict Mode dev.
  const initiated = useRef(false);

  // Parse and validate the return param — immutable for this page load.
  const returnParam = searchParams.get('return') ?? '';

  // Validate that the return param is a chrome-extension:// URL.
  // extensionId is kept for the open-redirect guard and future reference
  // but is no longer passed to sendMessage (content script bridge handles routing).
  const extensionId: string | null = (() => {
    try {
      const url = new URL(returnParam);
      if (url.protocol === 'chrome-extension:') return url.hostname;
    } catch { /* malformed URL */ }
    return null;
  })();

  // — Main effect — runs once after session resolves ——————————————————————
  useEffect(() => {
    if (isPending)         return;
    if (initiated.current) return;
    initiated.current = true;

    if (!session) {
      setPageState('redirecting');
      const nextPath   = `/extension/auth?return=${encodeURIComponent(returnParam)}`;
      const signInPath = `/auth/sign-in?callbackURL=${encodeURIComponent(nextPath)}`;
      router.replace(signInPath);
      return;
    }

    if (!extensionId) {
      setPageState('error');
      setErrorMsg(
        'Invalid extension URL. Please close this tab and try signing in ' +
        'from the D\u2019Vantage extension again.',
      );
      return;
    }

    void runBridge();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending]);

  // — Bridge: exchange → CustomEvent → await ack ——————————————————————————
  //
  // 1. Exchange current web session for an extension bearer token (API call).
  // 2. Set up the ack listener BEFORE dispatching so there is no race window.
  // 3. Dispatch CustomEvent('dvantage:ext:token') — auth-bridge.ts content
  //    script picks this up and relays it to the background SW.
  // 4. Await ack CustomEvent('dvantage:ext:ack') with an 8-second timeout.
  // 5. On success: transition to 'success' and close the tab.
  // 6. On failure or timeout: show actionable error.
  async function runBridge(): Promise<void> {
    setPageState('exchanging');

    let token:     string;
    let expiresAt: string;

    try {
      const result = await exchangeExtensionToken();
      token     = result.token;
      expiresAt = result.expiresAt;
    } catch (err) {
      setPageState('error');
      setErrorMsg(
        (err as Error).message ??
        'Couldn\u2019t connect to D\u2019Vantage. Please try again.',
      );
      return;
    }

    setPageState('sending');

    // Register the ack listener and dispatch the token event inside a single
    // Promise executor so there is no await gap between them. Dispatching
    // outside (after await) would deadlock: the Promise would never resolve
    // because the dispatch never fires until the Promise is already settled.
    const ack = await new Promise<BridgeAck>((resolve) => {
      const timer = setTimeout(() => {
        resolve({ ok: false, error: 'timeout' });
      }, ACK_TIMEOUT);

      window.addEventListener(
        ACK_EVENT,
        (event: Event) => {
          clearTimeout(timer);
          const detail = (event as CustomEvent<unknown>).detail;
          resolve(isBridgeAck(detail) ? detail : { ok: false, error: 'malformed_ack' });
        },
        { once: true },
      );

      // Dispatch INSIDE the executor, after the listener is registered.
      // The content script (auth-bridge.ts) picks this up synchronously and
      // relays it to the background SW via chrome.runtime.sendMessage.
      window.dispatchEvent(
        new CustomEvent(TOKEN_EVENT, { detail: { token, expiresAt } }),
      );
    });

    if (!ack.ok) {
      const isTimeout = ack.error === 'timeout';
      setPageState('error');
      setErrorMsg(
        isTimeout
          ? 'The extension didn\u2019t respond in time. Please ensure the ' +
            'D\u2019Vantage extension is enabled and try again.'
          : 'The extension didn\u2019t respond. Please ensure the D\u2019Vantage ' +
            'extension is enabled, then try again.',
      );
      return;
    }

    setPageState('success');
    // Tab was opened by chrome.tabs.create — window.close() is permitted.
    setTimeout(() => { window.close(); }, 1200);
  }

  function handleRetry(): void {
    initiated.current = false;
    setErrorMsg(null);
    void runBridge();
  }

  // — Render ————————————————————————————————————————————————————————————————
  const isLoading = LOADING_STATES.has(pageState);

  return (
    <div style={styles.page}>
      <DVantageMark />

      {isLoading && (
        <>
          <style>{`@keyframes vt-ext-auth-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={styles.spinner} aria-hidden="true" />
        </>
      )}

      {pageState === 'success' && (
        <div style={{ marginBottom: '16px' }} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none">
            <circle cx="12" cy="12" r="11" stroke="var(--vt-status-success)" strokeWidth="1.5" />
            <path
              d="M7.5 12l3 3 6-6.5"
              stroke="var(--vt-status-success)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {pageState === 'error' && (
        <div style={{ marginBottom: '16px' }} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none">
            <circle cx="12" cy="12" r="11" stroke="var(--vt-status-danger)" strokeWidth="1.5" />
            <path
              d="M12 8v5M12 15.5h.01"
              stroke="var(--vt-status-danger)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}

      <p style={styles.statusLabel}>{STATUS_LABEL[pageState]}</p>

      {pageState === 'error' && errorMsg !== null && (
        <p style={styles.errorDetail}>{errorMsg}</p>
      )}

      {pageState === 'error' && extensionId !== null && (
        <button type="button" style={styles.retryButton} onClick={handleRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export — Suspense boundary required by Next.js 15 for useSearchParams
// ---------------------------------------------------------------------------

export default function ExtensionAuthPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ExtensionAuthContent />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  page: {
    minHeight:      '100vh',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '40px 24px',
    background:     'var(--vt-surface-0)',
  },
  spinner: {
    width:          '28px',
    height:         '28px',
    borderRadius:   '50%',
    border:         '2.5px solid var(--vt-surface-border)',
    borderTopColor: 'var(--vt-brand-500)',
    animation:      'vt-ext-auth-spin 0.8s linear infinite',
    marginBottom:   '20px',
    flexShrink:     0,
  },
  statusLabel: {
    fontFamily: 'var(--vt-font-body)',
    fontSize:   '14px',
    fontWeight: 500,
    color:      'var(--vt-text-body)',
    margin:     '0 0 8px',
    textAlign:  'center',
  },
  errorDetail: {
    fontFamily: 'var(--vt-font-body)',
    fontSize:   '13px',
    color:      'var(--vt-text-muted)',
    margin:     '0 0 24px',
    textAlign:  'center',
    maxWidth:   '360px',
    lineHeight: 1.55,
  },
  retryButton: {
    display:      'inline-flex',
    alignItems:   'center',
    padding:      '9px 22px',
    background:   'var(--vt-brand-500)',
    border:       'none',
    borderRadius: '8px',
    fontFamily:   'var(--vt-font-body)',
    fontSize:     '13px',
    fontWeight:   500,
    color:        '#ffffff',
    cursor:       'pointer',
  },
} satisfies Record<string, CSSProperties>;
