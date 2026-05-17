'use client';
import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { exchangeExtensionToken } from '@/lib/api/extension';

type PageState = 'checking' | 'redirecting' | 'exchanging' | 'sending' | 'success' | 'error';

const STATUS_LABEL: Record<PageState, string> = {
  checking:    'Loading\u2026',
  redirecting: 'Redirecting to sign in\u2026',
  exchanging:  'Connecting your extension\u2026',
  sending:     'Finalising connection\u2026',
  success:     'Connected! Closing this tab\u2026',
  error:       'Something went wrong',
};

const LOADING_STATES = new Set<PageState>(['checking','redirecting','exchanging','sending']);

function DVantageMark() {
  return (
    <svg viewBox="0 0 32 24" width="40" height="30" fill="none" xmlns="http://www.w3.org/2000/svg"
      aria-label="D\u2019Vantage" style={{ marginBottom: '24px', flexShrink: 0 }}>
      <path d="M 2 20 L 11 4 L 30 20" stroke="var(--vt-brand-500)" strokeWidth="3"
        strokeLinecap="square" strokeLinejoin="miter" />
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
    } catch { /* malformed */ }
    return null;
  })();

  useEffect(() => {
    if (isPending) return;
    if (initiated.current) return;
    initiated.current = true;
    if (!session) {
      setPageState('redirecting');
      const nextPath = `/extension/auth?return=${encodeURIComponent(returnParam)}`;
      router.replace(`/auth/sign-in?callbackURL=${encodeURIComponent(nextPath)}`);
      return;
    }
    if (!extensionId) {
      setPageState('error');
      setErrorMsg('Invalid extension URL. Please close this tab and try signing in from the D\u2019Vantage extension again.');
      return;
    }
    void runBridge();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending]);

  // Navigate to callback.html — an extension-native page with unconditional
  // chrome.storage access. Token travels in URL hash (never sent to server).
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
      setErrorMsg((err as Error).message ?? 'Couldn\u2019t connect to D\u2019Vantage. Please try again.');
      return;
    }
    setPageState('sending');
    const callbackUrl =
      `chrome-extension://${extensionId}/callback.html` +
      `#token=${encodeURIComponent(token)}&expiresAt=${encodeURIComponent(expiresAt)}`;
    window.location.href = callbackUrl;
    // Fallback: if still alive after 3 s, navigation failed silently.
    setTimeout(() => {
      setPageState('error');
      setErrorMsg('Could not open the extension callback page. Please ensure the D\u2019Vantage extension is installed and enabled, then try again.');
    }, 3_000);
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
      {pageState === 'error' && (
        <div style={{ marginBottom: '16px' }} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none">
            <circle cx="12" cy="12" r="11" stroke="var(--vt-status-danger)" strokeWidth="1.5" />
            <path d="M12 8v5M12 15.5h.01" stroke="var(--vt-status-danger)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
      <p style={styles.statusLabel}>{STATUS_LABEL[pageState]}</p>
      {pageState === 'error' && errorMsg !== null && <p style={styles.errorDetail}>{errorMsg}</p>}
      {pageState === 'error' && extensionId !== null && (
        <button type="button" style={styles.retryButton} onClick={handleRetry}>Try again</button>
      )}
    </div>
  );
}

export default function ExtensionAuthPage() {
  return <Suspense fallback={<LoadingFallback />}><ExtensionAuthContent /></Suspense>;
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', background: 'var(--vt-surface-0)' },
  spinner: { width: '28px', height: '28px', borderRadius: '50%', border: '2.5px solid var(--vt-surface-border)', borderTopColor: 'var(--vt-brand-500)', animation: 'vt-ext-auth-spin 0.8s linear infinite', marginBottom: '20px', flexShrink: 0 },
  statusLabel: { fontFamily: 'var(--vt-font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--vt-text-body)', margin: '0 0 8px', textAlign: 'center' },
  errorDetail: { fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-muted)', margin: '0 0 24px', textAlign: 'center', maxWidth: '360px', lineHeight: 1.55 },
  retryButton: { display: 'inline-flex', alignItems: 'center', padding: '9px 22px', background: 'var(--vt-brand-500)', border: 'none', borderRadius: '8px', fontFamily: 'var(--vt-font-body)', fontSize: '13px', fontWeight: 500, color: '#ffffff', cursor: 'pointer' },
} satisfies Record<string, CSSProperties>;
