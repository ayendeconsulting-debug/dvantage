// ---------------------------------------------------------------------------
// D'Vantage — ProfilePanel
//
// The authenticated view inside the side panel. Replaces ReadyState (D2).
//
// Data strategy: stale-while-revalidate
//   1. On mount: read USER_PROFILE from chrome.storage.local → render cached
//      data immediately (zero loading flash for returning users).
//   2. Fetch GET /v1/extension/auth/profile in background with Bearer token.
//   3. On success: write fresh data to storage → update rendered profile.
//   4. On network failure: cached data stays rendered — silent degradation.
//
// Avatar: initials derived from name, brand-coloured circle.
//   Rationale: AuthUser.image is an OAuth URL that may expire or be null.
//   Initials are always available and do not depend on external image hosting.
//
// Sign-out flow:
//   1. Read current Bearer token from storage.
//   2. Call POST /v1/extension/auth/revoke (best-effort — non-blocking).
//   3. Clear EXTENSION_TOKEN + TOKEN_EXPIRES_AT + USER_PROFILE from storage.
//   4. AuthGate.onChanged fires → transitions side panel to unauthenticated.
//
// D5. Profile display is the primary deliverable of this file.
// Job detection panel (M14) will be added below ProfilePanel in App.tsx.
// ---------------------------------------------------------------------------

import { useEffect, useState, type CSSProperties } from 'react';
import { API_BASE, STORAGE_KEYS }                  from '../shared/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserProfile {
  name:  string;
  email: string;
  plan:  'free' | 'premium';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive up to 2 initials from a display name.
 * Single-word names → first 2 characters.
 * Multi-word names → first char of first word + first char of last word.
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return (parts[0] ?? '').slice(0, 2).toUpperCase();
  }
  const first = parts[0]?.[0] ?? '';
  const last  = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

/**
 * Fetch a fresh profile from the API.
 * Returns null on any failure — caller decides how to handle.
 */
async function fetchProfile(token: string): Promise<UserProfile | null> {
  try {
    const response = await fetch(`${API_BASE}/v1/extension/auth/profile`, {
      method:  'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) return null;

    const data = await response.json() as unknown;

    if (
      typeof data !== 'object' || data === null ||
      typeof (data as Record<string, unknown>)['name']  !== 'string' ||
      typeof (data as Record<string, unknown>)['email'] !== 'string' ||
      typeof (data as Record<string, unknown>)['plan']  !== 'string'
    ) {
      return null;
    }

    return data as UserProfile;
  } catch {
    // Network failure — caller falls back to cached data.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfilePanel() {
  const [profile,    setProfile]    = useState<UserProfile | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    // Read cached profile + token together — single storage round-trip.
    chrome.storage.local.get(
      [STORAGE_KEYS.USER_PROFILE, STORAGE_KEYS.EXTENSION_TOKEN],
      (result) => {
        // Render cached data immediately if present.
        const cached = result[STORAGE_KEYS.USER_PROFILE];
        if (
          cached !== null &&
          cached !== undefined &&
          typeof cached === 'object' &&
          typeof (cached as Record<string, unknown>)['name']  === 'string' &&
          typeof (cached as Record<string, unknown>)['email'] === 'string'
        ) {
          setProfile(cached as UserProfile);
        }

        // Revalidate in background — do not await.
        const token = result[STORAGE_KEYS.EXTENSION_TOKEN];
        if (typeof token !== 'string' || token.length === 0) return;

        void (async () => {
          const fresh = await fetchProfile(token);
          if (!fresh) return; // Network failure — keep cached.

          setProfile(fresh);
          chrome.storage.local.set({ [STORAGE_KEYS.USER_PROFILE]: fresh });
        })();
      },
    );
  }, []);

  async function handleSignOut(): Promise<void> {
    if (signingOut) return;
    setSigningOut(true);

    try {
      // Read token — needed for the revoke call.
      const result = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get(
          [STORAGE_KEYS.EXTENSION_TOKEN],
          resolve as (items: Record<string, unknown>) => void,
        );
      });

      const token = result[STORAGE_KEYS.EXTENSION_TOKEN];

      if (typeof token === 'string' && token.length > 0) {
        // Best-effort revoke — non-blocking. If the network call fails,
        // the token expires naturally after 30 days. Storage is always cleared.
        await fetch(`${API_BASE}/v1/extension/auth/revoke`, {
          method:  'POST',
          body:    '{}',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }).catch(() => {
          // Intentionally swallowed — storage clear below is guaranteed.
        });
      }
    } finally {
      // Always clear storage regardless of revoke result.
      // AuthGate.storage.onChanged fires on EXTENSION_TOKEN removal
      // → transitions side panel to unauthenticated automatically.
      chrome.storage.local.remove([
        STORAGE_KEYS.EXTENSION_TOKEN,
        STORAGE_KEYS.TOKEN_EXPIRES_AT,
        STORAGE_KEYS.USER_PROFILE,
      ]);
    }
  }

  // Show skeleton until cached or fresh data is available.
  if (!profile) {
    return <ProfileSkeleton />;
  }

  const initials = getInitials(profile.name);
  const isPro    = profile.plan === 'premium';

  return (
    <div style={styles.container}>
      <div style={styles.profileRow}>

        {/* Initials avatar — brand-coloured, no external URL dependency */}
        <div style={styles.avatar} aria-hidden="true">
          <span style={styles.avatarText}>{initials}</span>
        </div>

        {/* Identity block */}
        <div style={styles.identity}>
          <div style={styles.nameRow}>
            <span style={styles.name} title={profile.name}>
              {profile.name}
            </span>
            <span
              style={{
                ...styles.planBadge,
                ...(isPro ? styles.planBadgePro : styles.planBadgeFree),
              }}
              aria-label={isPro ? 'Pro plan' : 'Free plan'}
            >
              {isPro ? 'Pro' : 'Free'}
            </span>
          </div>
          <span style={styles.email} title={profile.email}>
            {profile.email}
          </span>
        </div>

      </div>

      {/* Sign out */}
      <button
        type="button"
        style={{
          ...styles.signOutBtn,
          ...(signingOut ? styles.signOutBtnDisabled : {}),
        }}
        onClick={() => void handleSignOut()}
        disabled={signingOut}
        aria-label="Sign out of D'Vantage extension"
      >
        {/* LogOut icon — inline SVG, no lucide dependency in extension */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton — shown on first mount before cached data is available
// ---------------------------------------------------------------------------

function ProfileSkeleton() {
  return (
    <div style={styles.container}>
      <div style={styles.profileRow}>
        <div
          style={{ ...styles.avatar, backgroundColor: 'var(--vt-surface-border)' }}
          aria-hidden="true"
        />
        <div style={styles.identity}>
          <div style={{ ...styles.skeletonBar, width: '110px', marginBottom: '7px' }} />
          <div style={{ ...styles.skeletonBar, width: '150px' }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    display:         'flex',
    flexDirection:   'column' as const,
    gap:             '10px',
    padding:         '14px 16px',
    backgroundColor: 'var(--vt-surface-raised)',
    borderBottom:    '1px solid var(--vt-surface-border)',
  },
  profileRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '11px',
  },
  avatar: {
    width:           '36px',
    height:          '36px',
    borderRadius:    '50%',
    backgroundColor: 'var(--vt-brand-500)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  avatarText: {
    fontFamily: "'Outfit', sans-serif",
    fontSize:   '12px',
    fontWeight: 700,
    color:      '#ffffff',
    lineHeight: 1,
    userSelect: 'none' as const,
  },
  identity: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           '3px',
    minWidth:      0,
    flex:          1,
  },
  nameRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
  },
  name: {
    fontFamily:    "'Outfit', sans-serif",
    fontSize:      '13px',
    fontWeight:    600,
    color:         'var(--vt-text-primary)',
    letterSpacing: '-0.01em',
    overflow:      'hidden',
    textOverflow:  'ellipsis',
    whiteSpace:    'nowrap' as const,
    minWidth:      0,
  },
  email: {
    fontFamily:   "'DM Sans', sans-serif",
    fontSize:     '11px',
    fontWeight:   400,
    color:        'var(--vt-text-secondary)',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap' as const,
  },
  planBadge: {
    fontFamily:    "'DM Sans', sans-serif",
    fontSize:      '10px',
    fontWeight:    500,
    padding:       '1px 6px',
    borderRadius:  '4px',
    flexShrink:    0,
    letterSpacing: '0.02em',
    lineHeight:    '16px',
  },
  planBadgeFree: {
    color:           'var(--vt-text-disabled)',
    backgroundColor: 'var(--vt-surface-border)',
  },
  planBadgePro: {
    color:           'var(--vt-brand-500)',
    backgroundColor: 'color-mix(in srgb, var(--vt-brand-500) 12%, transparent)',
  },
  signOutBtn: {
    display:       'inline-flex',
    alignItems:    'center',
    gap:           '5px',
    padding:       '0',
    border:        'none',
    background:    'transparent',
    fontFamily:    "'DM Sans', sans-serif",
    fontSize:      '11.5px',
    fontWeight:    400,
    color:         'var(--vt-text-secondary)',
    cursor:        'pointer',
    letterSpacing: '0.01em',
    transition:    'color 120ms',
    alignSelf:     'flex-start' as const,
  },
  signOutBtnDisabled: {
    color:  'var(--vt-text-disabled)',
    cursor: 'not-allowed' as const,
  },
  skeletonBar: {
    height:          '9px',
    borderRadius:    '4px',
    backgroundColor: 'var(--vt-surface-border)',
  },
} satisfies Record<string, CSSProperties>;
