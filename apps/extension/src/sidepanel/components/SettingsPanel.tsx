// ---------------------------------------------------------------------------
// D'Vantage — SettingsPanel
//
// Editable profile settings — phone number and LinkedIn URL.
// Rendered in place of the main panel stack when the user clicks the ⚙
// button in ProfilePanel.
//
// State machine:
//   loading  → Fetching current profile values from background SW (cache or API).
//   ready    → Form pre-populated; user can edit and save.
//   saving   → PATCH in flight; inputs and save button disabled.
//   saved    → "✓ Saved" flash for 1 500 ms, then resets to ready.
//   error    → API or network failure; inline error message with retry option.
//
// Data flow:
//   On mount:  REQUEST_PROFILE → populate phone + linkedinUrl inputs.
//   On save:   REQUEST_PROFILE_UPDATE → BG SW patches API → cache replaced.
//   On success: re-populate form from fresh profile (handles server-side
//               normalisation of phone/URL formats).
//
// Design language: matches ProfilePanel card patterns — surface-1, border-2,
//   10px radius, Outfit/DM Sans fonts, CSS custom properties throughout.
//   No inline hex literals.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { UserProfile }                                  from '../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingsState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; message: string };

interface SettingsPanelProps {
  /** Called when the user clicks ← Back. */
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Minimal LinkedIn URL validation — must contain "linkedin.com/in/". */
function isValidLinkedInUrl(value: string): boolean {
  if (!value) return true; // empty is allowed (clears the field)
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    return url.hostname.endsWith('linkedin.com') && url.pathname.startsWith('/in/');
  } catch {
    return false;
  }
}

/** Strip non-digit/+/-/space characters from phone — minimal normalisation. */
function normalisePhone(raw: string): string {
  return raw.trim();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsPanel({ onBack }: SettingsPanelProps) {
  const [settingsState, setSettingsState] = useState<SettingsState>({ status: 'loading' });

  const [phone,       setPhone]       = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [linkedinErr, setLinkedinErr] = useState('');

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load current profile on mount ─────────────────────────────────────────
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'REQUEST_PROFILE' }, (response: unknown) => {
      if (chrome.runtime.lastError) {
        setSettingsState({ status: 'error', message: 'Could not load your profile. Please try again.' });
        return;
      }

      const resp = response as { ok: boolean; profile?: UserProfile; error?: string };

      if (!resp.ok || !resp.profile) {
        setSettingsState({
          status:  'error',
          message: resp.error === 'not_authenticated'
            ? 'You are signed out. Please sign in again.'
            : 'Could not load your profile. Please try again.',
        });
        return;
      }

      setPhone(resp.profile.phone ?? '');
      setLinkedinUrl(resp.profile.linkedinUrl ?? '');
      setSettingsState({ status: 'ready' });
    });

    return () => {
      if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // ── Input handlers ─────────────────────────────────────────────────────────
  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setPhone(e.target.value);
  }

  function handleLinkedInChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const val = e.target.value;
    setLinkedinUrl(val);
    setLinkedinErr('');
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  function handleSave(): void {
    // Validate LinkedIn URL before sending
    if (linkedinUrl && !isValidLinkedInUrl(linkedinUrl)) {
      setLinkedinErr('Enter a valid LinkedIn profile URL (linkedin.com/in/your-name)');
      return;
    }

    setLinkedinErr('');
    setSettingsState({ status: 'saving' });

    const payload = {
      phone:       normalisePhone(phone) || null,
      linkedinUrl: linkedinUrl.trim() || null,
    };

    chrome.runtime.sendMessage(
      { type: 'REQUEST_PROFILE_UPDATE', payload },
      (response: unknown) => {
        if (chrome.runtime.lastError) {
          setSettingsState({ status: 'error', message: 'Could not save. Please try again.' });
          return;
        }

        const resp = response as { ok: boolean; profile?: UserProfile; error?: string };

        if (!resp.ok) {
          setSettingsState({
            status:  'error',
            message: resp.error === 'not_authenticated'
              ? 'You are signed out. Please sign in again.'
              : 'Could not save your profile. Please try again.',
          });
          return;
        }

        // Re-populate from server-normalised values
        if (resp.profile) {
          setPhone(resp.profile.phone ?? '');
          setLinkedinUrl(resp.profile.linkedinUrl ?? '');
        }

        setSettingsState({ status: 'saved' });

        // Auto-reset to ready after 1.5 s
        savedTimerRef.current = setTimeout(() => {
          setSettingsState({ status: 'ready' });
        }, 1_500);
      },
    );
  }

  // ── Retry (error → re-fetch) ──────────────────────────────────────────────
  function handleRetry(): void {
    setSettingsState({ status: 'loading' });
    chrome.runtime.sendMessage({ type: 'REQUEST_PROFILE' }, (response: unknown) => {
      if (chrome.runtime.lastError) {
        setSettingsState({ status: 'error', message: 'Could not load your profile. Please try again.' });
        return;
      }
      const resp = response as { ok: boolean; profile?: UserProfile; error?: string };
      if (!resp.ok || !resp.profile) {
        setSettingsState({ status: 'error', message: 'Could not load your profile. Please try again.' });
        return;
      }
      setPhone(resp.profile.phone ?? '');
      setLinkedinUrl(resp.profile.linkedinUrl ?? '');
      setSettingsState({ status: 'ready' });
    });
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const isLoading = settingsState.status === 'loading';
  const isSaving  = settingsState.status === 'saving';
  const isSaved   = settingsState.status === 'saved';
  const isError   = settingsState.status === 'error';
  const isLocked  = isLoading || isSaving || isSaved;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>

      {/* ── Header ── */}
      <div style={styles.header}>
        <button
          type="button"
          style={styles.backBtn}
          onClick={onBack}
          aria-label="Back to main panel"
        >
          <svg
            width="14" height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>

        <span style={styles.headerTitle}>Profile Settings</span>
      </div>

      {/* ── Card ── */}
      <div style={styles.card}>

        {/* Loading skeleton */}
        {isLoading && (
          <div style={styles.skeletonWrap}>
            <div style={{ ...styles.skeletonBar, width: '60px',  marginBottom: '6px' }} />
            <div style={{ ...styles.skeletonInput }} />
            <div style={{ ...styles.skeletonBar, width: '80px',  marginTop: '14px', marginBottom: '6px' }} />
            <div style={{ ...styles.skeletonInput }} />
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div style={styles.errorWrap}>
            <p style={styles.errorText}>{settingsState.message}</p>
            <button type="button" style={styles.retryBtn} onClick={handleRetry}>
              Try again
            </button>
          </div>
        )}

        {/* Form — shown in ready / saving / saved states */}
        {!isLoading && !isError && (
          <>
            {/* Phone field */}
            <div style={styles.fieldGroup}>
              <label htmlFor="dvantage-phone" style={styles.label}>
                Phone number
              </label>
              <input
                id="dvantage-phone"
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                disabled={isLocked}
                placeholder="+1 (555) 000-0000"
                style={{
                  ...styles.input,
                  ...(isLocked ? styles.inputDisabled : {}),
                }}
                autoComplete="tel"
              />
            </div>

            {/* LinkedIn URL field */}
            <div style={styles.fieldGroup}>
              <label htmlFor="dvantage-linkedin" style={styles.label}>
                LinkedIn URL
              </label>
              <input
                id="dvantage-linkedin"
                type="url"
                value={linkedinUrl}
                onChange={handleLinkedInChange}
                disabled={isLocked}
                placeholder="linkedin.com/in/your-name"
                style={{
                  ...styles.input,
                  ...(isLocked ? styles.inputDisabled : {}),
                  ...(linkedinErr ? styles.inputError : {}),
                }}
                autoComplete="url"
              />
              {linkedinErr && (
                <p style={styles.fieldError}>{linkedinErr}</p>
              )}
            </div>

            {/* Save button */}
            <button
              type="button"
              style={{
                ...styles.saveBtn,
                ...(isLocked ? styles.saveBtnDisabled : {}),
                ...(isSaved  ? styles.saveBtnSaved   : {}),
              }}
              onClick={handleSave}
              disabled={isLocked}
              aria-label="Save profile settings"
            >
              {isSaving && (
                <svg
                  width="13" height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ animation: 'dvantage-spin 0.8s linear infinite', flexShrink: 0 }}
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              )}
              {isSaved && (
                <svg
                  width="13" height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ flexShrink: 0 }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {isSaving ? 'Saving…' : isSaved ? 'Saved' : 'Save'}
            </button>

            {/* Helper note */}
            <p style={styles.helperNote}>
              These fields are used to autofill application forms.
            </p>
          </>
        )}

      </div>

      {/* Spin keyframe injected once */}
      <style>{`@keyframes dvantage-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — matches ProfilePanel Direction 2 design language
// ---------------------------------------------------------------------------

const styles = {
  root: {
    padding: '12px 14px',
  },

  // ── Header ──
  header: {
    display:     'flex',
    alignItems:  'center',
    gap:         '8px',
    marginBottom:'12px',
  },
  backBtn: {
    display:    'inline-flex',
    alignItems: 'center',
    gap:        '3px',
    padding:    '0',
    border:     'none',
    background: 'transparent',
    fontFamily: "'DM Sans', sans-serif",
    fontSize:   '11px',
    fontWeight: 500,
    color:      'var(--vt-text-4)',
    cursor:     'pointer',
    lineHeight: 1,
  },
  headerTitle: {
    fontFamily:    "'Outfit', sans-serif",
    fontSize:      '13px',
    fontWeight:    600,
    color:         'var(--vt-text-1)',
    letterSpacing: '-0.01em',
  },

  // ── Card ──
  card: {
    backgroundColor: 'var(--vt-surface-1)',
    border:          '0.5px solid var(--vt-border-2)',
    borderRadius:    '10px',
    padding:         '14px',
  },

  // ── Field group ──
  fieldGroup: {
    marginBottom: '12px',
  },
  label: {
    display:       'block',
    fontFamily:    "'DM Sans', sans-serif",
    fontSize:      '11px',
    fontWeight:    500,
    color:         'var(--vt-text-3)',
    letterSpacing: '0.01em',
    marginBottom:  '5px',
  } as CSSProperties,
  input: {
    display:         'block',
    width:           '100%',
    boxSizing:       'border-box' as const,
    padding:         '8px 10px',
    borderRadius:    '7px',
    border:          '0.5px solid var(--vt-border-2)',
    backgroundColor: 'var(--vt-surface-0)',
    fontFamily:      "'DM Sans', sans-serif",
    fontSize:        '12px',
    fontWeight:      400,
    color:           'var(--vt-text-1)',
    outline:         'none',
    transition:      'border-color 120ms',
  },
  inputDisabled: {
    opacity: 0.5,
    cursor:  'not-allowed' as const,
  },
  inputError: {
    borderColor: 'var(--vt-danger, #e55)',
  },
  fieldError: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize:   '10px',
    color:      'var(--vt-danger, #e55)',
    margin:     '4px 0 0',
  } as CSSProperties,

  // ── Save button ──
  saveBtn: {
    display:       'inline-flex',
    alignItems:    'center',
    justifyContent:'center',
    gap:           '6px',
    width:         '100%',
    padding:       '9px 0',
    borderRadius:  '7px',
    border:        'none',
    background:    'var(--vt-brand-500)',
    color:         '#fff',
    fontFamily:    "'Outfit', sans-serif",
    fontSize:      '13px',
    fontWeight:    600,
    cursor:        'pointer',
    letterSpacing: '0.01em',
    transition:    'background 150ms, opacity 150ms',
    marginBottom:  '10px',
  },
  saveBtnDisabled: {
    opacity: 0.65,
    cursor:  'not-allowed' as const,
  },
  saveBtnSaved: {
    background: 'var(--vt-success, #22c55e)',
  },

  // ── Helper note ──
  helperNote: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize:   '10px',
    fontWeight: 400,
    color:      'var(--vt-text-5)',
    margin:     0,
    lineHeight: 1.5,
  } as CSSProperties,

  // ── Error state ──
  errorWrap: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           '10px',
  },
  errorText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize:   '12px',
    color:      'var(--vt-danger, #e55)',
    margin:     0,
  } as CSSProperties,
  retryBtn: {
    alignSelf:    'flex-start' as const,
    padding:      '6px 12px',
    borderRadius: '6px',
    border:       '0.5px solid var(--vt-border-2)',
    background:   'transparent',
    fontFamily:   "'DM Sans', sans-serif",
    fontSize:     '12px',
    fontWeight:   500,
    color:        'var(--vt-text-2)',
    cursor:       'pointer',
  },

  // ── Loading skeleton ──
  skeletonWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  skeletonBar: {
    height:          '8px',
    borderRadius:    '4px',
    backgroundColor: 'var(--vt-surface-3)',
  },
  skeletonInput: {
    height:          '34px',
    borderRadius:    '7px',
    backgroundColor: 'var(--vt-surface-3)',
  },
} satisfies Record<string, CSSProperties>;
