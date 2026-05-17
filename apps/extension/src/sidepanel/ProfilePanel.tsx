// ---------------------------------------------------------------------------
// D'Vantage — ProfilePanel (Direction 2: Warm Depth)
//
// Visual redesign from flat row → inner card with rounded-square avatar.
//
// Layout:
//   section wrapper (padding only)
//   └── card (surface-1, border-2, radius 10px)
//       ├── profile row (avatar + identity)
//       └── card footer (divider + sign-out)
//
// Avatar: rounded square (10px radius), surface-3 bg, brand-300 initials.
//   Rationale: rounded-square reads as a product UI element rather than a
//   generic user icon, reinforcing D'Vantage's tool identity.
//
// Data strategy: stale-while-revalidate (unchanged from D5).
// Sign-out flow: unchanged from D5.
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return (parts[0] ?? '').slice(0, 2).toUpperCase();
  }
  const first = parts[0]?.[0] ?? '';
  const last  = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

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
    chrome.storage.local.get(
      [STORAGE_KEYS.USER_PROFILE, STORAGE_KEYS.EXTENSION_TOKEN],
      (result) => {
        const cached = result[STORAGE_KEYS.USER_PROFILE];
        if (
          cached !== null && cached !== undefined &&
          typeof cached === 'object' &&
          typeof (cached as Record<string, unknown>)['name']  === 'string' &&
          typeof (cached as Record<string, unknown>)['email'] === 'string'
        ) {
          setProfile(cached as UserProfile);
        }

        const token = result[STORAGE_KEYS.EXTENSION_TOKEN];
        if (typeof token !== 'string' || token.length === 0) return;

        void (async () => {
          const fresh = await fetchProfile(token);
          if (!fresh) return;
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
      const result = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get(
          [STORAGE_KEYS.EXTENSION_TOKEN],
          resolve as (items: Record<string, unknown>) => void,
        );
      });

      const token = result[STORAGE_KEYS.EXTENSION_TOKEN];

      if (typeof token === 'string' && token.length > 0) {
        await fetch(`${API_BASE}/v1/extension/auth/revoke`, {
          method:  'POST',
          body:    '{}',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }).catch(() => undefined);
      }
    } finally {
      chrome.storage.local.remove([
        STORAGE_KEYS.EXTENSION_TOKEN,
        STORAGE_KEYS.TOKEN_EXPIRES_AT,
        STORAGE_KEYS.USER_PROFILE,
      ]);
    }
  }

  if (!profile) {
    return <ProfileSkeleton />;
  }

  const initials = getInitials(profile.name);
  const isPro    = profile.plan === 'premium';

  return (
    <div style={styles.section}>
      <div style={styles.card}>

        {/* ── Profile row ──────────────────────────────────────────────── */}
        <div style={styles.profileRow}>

          {/* Rounded-square avatar */}
          <div style={styles.avatar} aria-hidden="true">
            <span style={styles.avatarText}>{initials}</span>
          </div>

          {/* Identity */}
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

        {/* ── Card footer — sign out ────────────────────────────────────── */}
        <div style={styles.cardFooter}>
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
            <svg
              width="11" height="11"
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

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ProfileSkeleton() {
  return (
    <div style={styles.section}>
      <div style={styles.card}>
        <div style={styles.profileRow}>
          <div
            style={{ ...styles.avatar, backgroundColor: 'var(--vt-surface-3)' }}
            aria-hidden="true"
          />
          <div style={styles.identity}>
            <div style={{ ...styles.skeletonBar, width: '110px', marginBottom: '7px' }} />
            <div style={{ ...styles.skeletonBar, width: '150px' }} />
          </div>
        </div>
        <div style={styles.cardFooter}>
          <div style={{ ...styles.skeletonBar, width: '52px' }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — Direction 2: Warm Depth
// ---------------------------------------------------------------------------

const styles = {
  /* Outer wrapper — just spacing, no visible chrome */
  section: {
    padding: '12px 14px 0',
  },

  /* Inner card — surface-1, subtle border, 10px radius */
  card: {
    backgroundColor: 'var(--vt-surface-1)',
    border:          '0.5px solid var(--vt-border-2)',
    borderRadius:    '10px',
    overflow:        'hidden',
  },

  /* Profile row — avatar + identity, no bottom border */
  profileRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '11px',
    padding:    '12px',
  },

  /* Rounded-square avatar — the Direction 2 signature element */
  avatar: {
    width:           '36px',
    height:          '36px',
    borderRadius:    '10px',
    backgroundColor: 'var(--vt-surface-3)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  avatarText: {
    fontFamily: "'Outfit', sans-serif",
    fontSize:   '12px',
    fontWeight: 700,
    color:      'var(--vt-brand-300)',
    lineHeight: 1,
    userSelect: 'none' as const,
  },

  /* Identity block */
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
    color:         'var(--vt-text-1)',
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
    color:        'var(--vt-text-4)',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap' as const,
  },

  /* Plan badge */
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
    color:           'var(--vt-text-5)',
    backgroundColor: 'var(--vt-surface-3)',
  },
  planBadgePro: {
    color:           'var(--vt-brand-300)',
    backgroundColor: 'color-mix(in srgb, var(--vt-brand-500) 12%, transparent)',
  },

  /* Card footer — divider + sign-out */
  cardFooter: {
    borderTop:  '0.5px solid var(--vt-border-1)',
    padding:    '9px 12px',
    display:    'flex',
    alignItems: 'center',
  },
  signOutBtn: {
    display:    'inline-flex',
    alignItems: 'center',
    gap:        '5px',
    padding:    '0',
    border:     'none',
    background: 'transparent',
    fontFamily: "'DM Sans', sans-serif",
    fontSize:   '11px',
    fontWeight: 400,
    color:      'var(--vt-text-5)',
    cursor:     'pointer',
    transition: 'color 120ms',
  },
  signOutBtnDisabled: {
    color:  'var(--vt-border-2)',
    cursor: 'not-allowed' as const,
  },

  /* Skeleton bars */
  skeletonBar: {
    height:          '8px',
    borderRadius:    '4px',
    backgroundColor: 'var(--vt-surface-3)',
  },
} satisfies Record<string, CSSProperties>;
