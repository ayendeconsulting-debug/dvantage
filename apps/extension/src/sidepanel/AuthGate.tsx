// ---------------------------------------------------------------------------
// D'Vantage — AuthGate
//
// Three states:
//   checking        → null render (avoids flash of sign-in for authed users)
//   unauthenticated → logo + "Sign in to D'Vantage" CTA
//   authenticated   → passes children through unchanged
//
// Auth check: reads EXTENSION_TOKEN + TOKEN_EXPIRES_AT from storage on mount.
//
// D3: chrome.storage.onChanged listener — transitions on token write/clear.
// D4: tabs.onUpdated direct exchange — BG SW writes token after /extension/done.
// D5: Token expiry enforcement + silent refresh trigger.
//
// Expiry logic (on mount):
//   expired (expiresAt in past)    → clear storage → unauthenticated
//   near-expiry (< 7 days left)    → authenticated + send REQUEST_REFRESH to BG SW
//   valid (>= 7 days remaining)    → authenticated (no action)
//   no expiresAt stored            → authenticated (legacy — refreshes on next cycle)
//
// Refresh flow:
//   AuthGate sends REQUEST_REFRESH to BG SW via chrome.runtime.sendMessage.
//   BG SW calls POST /v1/extension/auth/refresh (Bearer token).
//   On 200: BG SW writes new TOKEN_EXPIRES_AT to storage → onChanged fires.
//   On 401: BG SW clears EXTENSION_TOKEN + TOKEN_EXPIRES_AT → onChanged fires
//           → AuthGate transitions to unauthenticated.
// ---------------------------------------------------------------------------

import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import { APP_BASE, STORAGE_KEYS } from '../shared/constants';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Trigger a silent refresh when fewer than this many ms remain. */
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthState = 'checking' | 'unauthenticated' | 'authenticated';

interface AuthGateProps {
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Evaluate token + expiry from storage values.
 * Returns the resolved auth state and whether a refresh should be triggered.
 */
function evaluateToken(
  token: unknown,
  expiresAt: unknown,
): { state: 'unauthenticated' | 'authenticated'; shouldRefresh: boolean } {
  // No token → unauthenticated immediately.
  if (typeof token !== 'string' || token.length === 0) {
    return { state: 'unauthenticated', shouldRefresh: false };
  }

  // No expiresAt stored (legacy tokens pre-D3) → treat as authenticated.
  // Will refresh on next cycle once the server writes a new expiresAt.
  if (typeof expiresAt !== 'string' || expiresAt.length === 0) {
    return { state: 'authenticated', shouldRefresh: true };
  }

  const expiryMs = Date.parse(expiresAt);
  const remainingMs = expiryMs - Date.now();

  // Expired → unauthenticated.
  if (remainingMs <= 0) {
    return { state: 'unauthenticated', shouldRefresh: false };
  }

  // Near-expiry → authenticated but trigger refresh.
  if (remainingMs < REFRESH_THRESHOLD_MS) {
    return { state: 'authenticated', shouldRefresh: true };
  }

  // Valid, plenty of time left.
  return { state: 'authenticated', shouldRefresh: false };
}

/**
 * Clear both token keys from storage.
 * Called when the token is expired or the BG SW receives a 401 on refresh.
 */
function clearTokenStorage(): void {
  chrome.storage.local.remove([STORAGE_KEYS.EXTENSION_TOKEN, STORAGE_KEYS.TOKEN_EXPIRES_AT]);
}

/**
 * Send REQUEST_REFRESH to the BG SW.
 * Fire-and-forget from AuthGate's perspective — the BG SW handles
 * the response and writes to storage; onChanged propagates the result.
 */
function requestRefresh(): void {
  chrome.runtime.sendMessage({ type: 'REQUEST_REFRESH' }, () => {
    // Consume lastError to suppress "unchecked runtime.lastError" warning.
    // The BG SW handles the actual refresh and storage write independently.
    void chrome.runtime.lastError;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AuthGate({ children }: AuthGateProps) {
  const [authState, setAuthState] = useState<AuthState>('checking');

  useEffect(() => {
    // — Initial check — reads token + expiresAt together ——————————————————
    chrome.storage.local.get(
      [STORAGE_KEYS.EXTENSION_TOKEN, STORAGE_KEYS.TOKEN_EXPIRES_AT],
      (result) => {
        const token = result[STORAGE_KEYS.EXTENSION_TOKEN];
        const expiresAt = result[STORAGE_KEYS.TOKEN_EXPIRES_AT];
        const { state, shouldRefresh } = evaluateToken(token, expiresAt);

        if (state === 'unauthenticated') {
          // Clear any stale keys (e.g. expired token with no expiresAt).
          clearTokenStorage();
        }

        setAuthState(state);

        if (shouldRefresh) {
          requestRefresh();
        }
      },
    );

    // — Live update ————————————————————————————————————————————————————————
    // Fires when the BG SW writes after exchange, refresh, or revoke.
    // Re-evaluates both keys on any EXTENSION_TOKEN change.
    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ): void {
      if (area !== 'local') return;
      if (!(STORAGE_KEYS.EXTENSION_TOKEN in changes)) return;

      const newToken = changes[STORAGE_KEYS.EXTENSION_TOKEN]?.newValue;

      // If token was cleared → unauthenticated immediately.
      if (typeof newToken !== 'string' || newToken.length === 0) {
        setAuthState('unauthenticated');
        return;
      }

      // Token written → re-read both keys to get the latest expiresAt.
      chrome.storage.local.get(
        [STORAGE_KEYS.EXTENSION_TOKEN, STORAGE_KEYS.TOKEN_EXPIRES_AT],
        (result) => {
          const token = result[STORAGE_KEYS.EXTENSION_TOKEN];
          const expiresAt = result[STORAGE_KEYS.TOKEN_EXPIRES_AT];
          const { state, shouldRefresh } = evaluateToken(token, expiresAt);
          setAuthState(state);
          if (shouldRefresh) requestRefresh();
        },
      );
    }

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  if (authState === 'checking') return null;
  if (authState === 'authenticated') return <>{children}</>;
  return <SignInScreen />;
}

// ---------------------------------------------------------------------------
// SignInScreen
// ---------------------------------------------------------------------------

function SignInScreen() {
  function handleSignIn(): void {
    const callbackUrl = '/extension/done';
    const signInUrl = `${APP_BASE}/auth/sign-in?callbackURL=${encodeURIComponent(callbackUrl)}`;
    chrome.tabs.create({ url: signInUrl });
  }

  return (
    <div style={styles.container}>
      <svg
        viewBox="0 0 32 24"
        width="48"
        height="36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="D'Vantage mark"
        style={styles.mark}
      >
        <path
          d="M 2 20 L 11 4 L 30 20"
          stroke="var(--vt-brand-500)"
          strokeWidth="3"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>

      <div style={styles.wordmark} aria-label="D'Vantage">
        <span style={styles.wordmarkD}>D</span>
        <span style={styles.wordmarkApostrophe}>&apos;</span>
        <span style={styles.wordmarkVant}>vant</span>
        <span style={styles.wordmarkAge}>age</span>
      </div>

      <p style={styles.tagline}>From applied to interview.</p>

      <button type="button" className="dvantage-btn-primary" onClick={handleSignIn}>
        Sign in to D&apos;Vantage
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    backgroundColor: 'var(--vt-surface-0)',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
  },
  mark: {
    marginBottom: '20px',
    flexShrink: 0,
  },
  wordmark: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '26px',
    letterSpacing: '-0.03em',
    lineHeight: 1,
    marginBottom: '12px',
    userSelect: 'none',
  },
  wordmarkD: { fontWeight: 900, color: 'var(--vt-brand-500)' },
  wordmarkApostrophe: { fontWeight: 200, color: 'var(--vt-text-1)' },
  wordmarkVant: { fontWeight: 900, color: 'var(--vt-text-1)' },
  wordmarkAge: { fontWeight: 200, color: 'var(--vt-brand-400)' },
  tagline: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '12px',
    fontWeight: 400,
    color: 'var(--vt-text-4)',
    marginBottom: '32px',
    letterSpacing: '0.01em',
  },
} satisfies Record<string, CSSProperties>;
