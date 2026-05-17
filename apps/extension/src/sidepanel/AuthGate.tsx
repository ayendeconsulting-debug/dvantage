// ---------------------------------------------------------------------------
// D'Vantage — AuthGate
//
// Three states:
//   checking        → null render (avoids flash of sign-in for authed users)
//   unauthenticated → logo + "Sign in to D'Vantage" CTA
//   authenticated   → passes children through unchanged
//
// Auth check: single chrome.storage.local.get on mount.
//
// D3 addition: chrome.storage.onChanged listener — when the background SW
// writes the token after the exchange, the side panel (if open) transitions
// unauthenticated → authenticated without a reload.
//
// D4 FINAL: Sign-in opens dvantage.ca/auth/sign-in?callbackURL=/extension/done.
// The BG SW detects the /extension/done URL via chrome.tabs.onUpdated and
// calls the exchange endpoint directly — no web→extension communication.
// ---------------------------------------------------------------------------

import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import { APP_BASE, STORAGE_KEYS } from '../shared/constants';

type AuthState = 'checking' | 'unauthenticated' | 'authenticated';

interface AuthGateProps {
  children: ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const [authState, setAuthState] = useState<AuthState>('checking');

  useEffect(() => {
    // — Initial check —————————————————————————————————————————————————————
    chrome.storage.local.get(STORAGE_KEYS.EXTENSION_TOKEN, (result) => {
      const token: unknown = result[STORAGE_KEYS.EXTENSION_TOKEN];
      setAuthState(
        typeof token === 'string' && token.length > 0
          ? 'authenticated'
          : 'unauthenticated',
      );
    });

    // — Live update ————————————————————————————————————————————————————————
    // Fires when the BG SW writes the token after the direct exchange.
    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      area:    string,
    ): void {
      if (area !== 'local') return;
      if (!(STORAGE_KEYS.EXTENSION_TOKEN in changes)) return;

      const newValue: unknown = changes[STORAGE_KEYS.EXTENSION_TOKEN]?.newValue;
      setAuthState(
        typeof newValue === 'string' && newValue.length > 0
          ? 'authenticated'
          : 'unauthenticated',
      );
    }

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => { chrome.storage.onChanged.removeListener(handleStorageChange); };
  }, []);

  if (authState === 'checking')      return null;
  if (authState === 'authenticated') return <>{children}</>;
  return <SignInScreen />;
}

// — SignInScreen ——————————————————————————————————————————————————————————

function SignInScreen() {
  function handleSignIn(): void {
    // Open sign-in page with callbackURL=/extension/done.
    // The BG SW monitors chrome.tabs.onUpdated for that URL and calls the
    // exchange endpoint directly once sign-in is complete.
    const callbackUrl = '/extension/done';
    const signInUrl   = `${APP_BASE}/auth/sign-in?callbackURL=${encodeURIComponent(callbackUrl)}`;
    chrome.tabs.create({ url: signInUrl });
  }

  return (
    <div style={styles.container}>

      {/* — D'Vantage mark ———————————————————————————————————————————————— */}
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

      {/* — Wordmark ——————————————————————————————————————————————————————— */}
      <div style={styles.wordmark} aria-label="D'Vantage">
        <span style={styles.wordmarkD}>D</span>
        <span style={styles.wordmarkApostrophe}>&apos;</span>
        <span style={styles.wordmarkVant}>vant</span>
        <span style={styles.wordmarkAge}>age</span>
      </div>

      {/* — Tagline ———————————————————————————————————————————————————————— */}
      <p style={styles.tagline}>From applied to interview.</p>

      {/* — CTA ———————————————————————————————————————————————————————————— */}
      <button
        type="button"
        className="dvantage-btn-primary"
        onClick={handleSignIn}
      >
        Sign in to D&apos;Vantage
      </button>

    </div>
  );
}

// — Styles ————————————————————————————————————————————————————————————————

const styles = {
  container: {
    backgroundColor: 'var(--vt-surface-0)',
    minHeight:       '100vh',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '32px 24px',
  },
  mark: {
    marginBottom: '20px',
    flexShrink:   0,
  },
  wordmark: {
    fontFamily:    "'Outfit', sans-serif",
    fontSize:      '26px',
    letterSpacing: '-0.03em',
    lineHeight:    1,
    marginBottom:  '12px',
    userSelect:    'none',
  },
  wordmarkD: {
    fontWeight: 900,
    color:      'var(--vt-brand-500)',
  },
  wordmarkApostrophe: {
    fontWeight: 200,
    color:      'var(--vt-text-1)',
  },
  wordmarkVant: {
    fontWeight: 900,
    color:      'var(--vt-text-1)',
  },
  wordmarkAge: {
    fontWeight: 200,
    color:      'var(--vt-brand-400)',
  },
  tagline: {
    fontFamily:    "'DM Sans', sans-serif",
    fontSize:      '12px',
    fontWeight:    400,
    color:         'var(--vt-text-4)',
    marginBottom:  '32px',
    letterSpacing: '0.01em',
  },
} satisfies Record<string, CSSProperties>;
