'use client';

// ---------------------------------------------------------------------------
// D'Vantage — Extension auth callback page
//
// URL: /extension/auth?return=chrome-extension://<extensionId>
//
// Flow:
//   1. Session loading  → spinner
//   2. Not logged in    → redirect to /auth/sign-in (preserving return param)
//   3. Logged in        → POST /v1/extension/auth/exchange
//   4. Exchange success → set dvantage_ext_pending cookie on dvantage.ca
//   5. BG SW picks up cookie via chrome.cookies.onChanged → stores token
//   6. AuthGate.onChanged → side panel transitions to "Connected"
//   7. This tab shows "Connected!" and closes after 1.5 s
//
// Token delivery (D4 — final):
//   window.location.href to chrome-extension:// is blocked by Chrome MV3.
//   Content script injection was unreliable in unpacked dev extensions.
//   Cookie-based handoff: the web page sets a short-lived cookie on dvantage.ca.
//   Chrome fires chrome.cookies.onChanged in the BG SW immediately, waking
//   it regardless of lifecycle state. No navigation, no messaging, no scripts.
//
// Security:
//   • return param validated — must be chrome-extension:// protocol.
//   • Cookie value validated by the BG SW (token format + expiry check).
//   • Cookie max-age=60 — auto-expires if SW fails to read it.
//   • samesite=strict — only sent in first-party dvantage.ca context.
// ---------------------------------------------------------------------------

import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { exchangeExtensionToken } from '@/lib/api/extension';

// ---------------------------------------------------------------------------
// Page state machine
// ---------------------------------------------------------------------------

type PageState =
  | 'checking' // Session still loading
  | 'redirecting' // Not logged in — going to /auth/sign-in
  | 'exchanging' // Calling POST /v1/extension/auth/exchange
  | 'sending' // Setting handoff cookie
  | 'success' // Cookie set — BG SW will pick it up — closing tab
  | 'error';

const STATUS_LABEL: Record<PageState, string> = {
  checking: 'Loading\u2026',
  redirecting: 'Redirecting to sign in\u2026',
  exchanging: 'Connecting your extension\u2026',
  sending: 'Finalising connection\u2026',
  success: 'Connected! Closing this tab\u2026',
  error: 'Something went wrong',
};

const LOADING_STATES = new Set<PageState>(['checking', 'redirecting', 'exchanging', 'sending']);

// ---------------------------------------------------------------------------
// Shared mark
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
// Inner content
// ---------------------------------------------------------------------------

function ExtensionAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();

  const [pageState, setPageState] = useState<PageState>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const initiated = useRef(false);

  const returnParam = searchParams.get('return') ?? '';
  const extensionId: string | null = (() => {
    try {
      const url = new URL(returnParam);
      if (url.protocol === 'chrome-extension:') return url.hostname;
    } catch {
      /* malformed */
    }
    return null;
  })();

  useEffect(() => {
    if (isPending) return;
    if (initiated.current) return;
    initiated.current = true;

    if (!session) {
      setPageState('redirecting');
      const nextPath = `/extension/auth?return=${encodeURIComponent(returnParam)}`;
      const signInPath = `/auth/sign-in?callbackURL=${encodeURIComponent(nextPath)}`;
      router.replace(signInPath);
      return;
    }

    if (!extensionId) {
      setPageState('error');
      setErrorMsg(
        'Invalid extension URL. Please close this tab and try signing in from the D\u2019Vantage extension again.',
      );
      return;
    }

    void runBridge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending]);

  // ── Bridge: exchange → cookie handoff ────────────────────────────────────
  //
  // 1. POST /v1/extension/auth/exchange — mints a long-lived bearer token.
  // 2. Set dvantage_ext_pending cookie — value: "{token}|{expiresAt}".
  //    The BG SW's chrome.cookies.onChanged listener fires immediately,
  //    parses the value, stores to chrome.storage.local, deletes the cookie.
  // 3. Show success UI — AuthGate transitions via chrome.storage.onChanged.
  // 4. Close tab after 1.5 s.
  async function runBridge(): Promise<void> {
    if (!extensionId) return;
    setPageState('exchanging');

    let token: string;
    let expiresAt: string;

    try {
      const result = await exchangeExtensionToken();
      token = result.token;
      expiresAt = result.expiresAt;
    } catch (err) {
      setPageState('error');
      setErrorMsg(
        (err as Error).message ?? 'Couldn\u2019t connect to D\u2019Vantage. Please try again.',
      );
      return;
    }

    setPageState('sending');

    // Set handoff cookie — readable by the extension via chrome.cookies API.
    // Format: {token}|{expiresAt} — both values are safe characters (hex + ISO 8601).
    // max-age=60 ensures auto-expiry if the SW doesn't process it within 60 s.
    document.cookie = [
      `dvantage_ext_pending=${token}|${expiresAt}`,
      'path=/',
      'max-age=60',
      'secure',
      'samesite=strict',
    ].join('; ');

    setPageState('success');
    // chrome.cookies.onChanged in the BG SW fires synchronously with the
    // cookie set — storage write completes independently of this tab.
    setTimeout(() => {
      window.close();
    }, 1_500);
  }

  function handleRetry(): void {
    initiated.current = false;
    setErrorMsg(null);
    void runBridge();
  }

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

      {pageState === 'error' && errorMsg !== null && <p style={styles.errorDetail}>{errorMsg}</p>}

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
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
    background: 'var(--vt-surface-0)',
  },
  spinner: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '2.5px solid var(--vt-surface-border)',
    borderTopColor: 'var(--vt-brand-500)',
    animation: 'vt-ext-auth-spin 0.8s linear infinite',
    marginBottom: '20px',
    flexShrink: 0,
  },
  statusLabel: {
    fontFamily: 'var(--vt-font-body)',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--vt-text-body)',
    margin: '0 0 8px',
    textAlign: 'center',
  },
  errorDetail: {
    fontFamily: 'var(--vt-font-body)',
    fontSize: '13px',
    color: 'var(--vt-text-muted)',
    margin: '0 0 24px',
    textAlign: 'center',
    maxWidth: '360px',
    lineHeight: 1.55,
  },
  retryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '9px 22px',
    background: 'var(--vt-brand-500)',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'var(--vt-font-body)',
    fontSize: '13px',
    fontWeight: 500,
    color: '#ffffff',
    cursor: 'pointer',
  },
} satisfies Record<string, CSSProperties>;
