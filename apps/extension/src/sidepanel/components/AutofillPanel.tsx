// ---------------------------------------------------------------------------
// AutofillPanel
//
// Renders the autofill UI inside the side panel. Sits below ScorePanel in App.tsx.
//
// States:
//   idle      – no application form detected. Renders nothing.
//   loading   – fetching profile from background SW.
//   ready     – form detected; profile loaded; field-value preview shown.
//   filling   – autofill in progress.
//   complete  – fields filled; capture fired; review reminder shown.
//   error     – profile fetch or fill failed; retryable.
//
// D11 – M19 addition:
//   On transition to 'complete', reads ACTIVE_JOB from chrome.storage.local
//   and fires REQUEST_CAPTURE { company, role, pageUrl } to the background SW.
//   This is fire-and-forget – the complete state renders immediately, the
//   capture POST happens asynchronously, and failures are silent.
//
// D12 – dead link fix:
//   Replaced broken dvantage.ca/settings/profile link with gear-button copy.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties }           from 'react';
import { STORAGE_KEYS }                from '../../shared/constants';
import type { ActiveForm, UserProfile, AutofillPreviewField, AutofillFieldKey, ExtractedJob } from '../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; form: ActiveForm; profile: UserProfile }
  | { status: 'filling' }
  | { status: 'complete'; filled: number; skipped: string[] }
  | { status: 'error'; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProfileValue(
  profileKey: AutofillFieldKey,
  profile:    UserProfile,
): string | null {
  switch (profileKey) {
    case 'firstName':   return profile.firstName || null;
    case 'lastName':    return profile.lastName  || null;
    case 'fullName':    return `${profile.firstName} ${profile.lastName}`.trim() || null;
    case 'email':       return profile.email     || null;
    case 'phone':       return profile.phone;
    case 'linkedinUrl': return profile.linkedinUrl;
    case 'currentRole': return profile.currentRole;
    case 'topSkills':   return profile.topSkills.length > 0 ? profile.topSkills.join(', ') : null;
    case 'summary': {
      const s = profile.summary;
      if (!s) return null;
      return s.length > 80 ? s.slice(0, 80) + '\u2026' : s;
    }
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Capture helper – fire-and-forget
// ---------------------------------------------------------------------------

/**
 * Read ACTIVE_JOB from storage and fire REQUEST_CAPTURE to the background SW.
 * Never awaited – capture failure must not affect the complete state render.
 */
function fireCapture(pageUrl: string): void {
  void (async (): Promise<void> => {
    try {
      const stored   = await chrome.storage.local.get([STORAGE_KEYS.ACTIVE_JOB]);
      const activeJob = stored[STORAGE_KEYS.ACTIVE_JOB] as ExtractedJob | null | undefined;

      const company = activeJob?.company ?? null;
      const role    = activeJob?.title   ?? null;

      chrome.runtime.sendMessage(
        { type: 'REQUEST_CAPTURE', payload: { company, role, pageUrl } },
        () => {
          // Consume lastError – fire-and-forget; router returns undefined (no response).
          void chrome.runtime.lastError;
        },
      );

      console.log(
        `[DVantage AutofillPanel] REQUEST_CAPTURE fired – company="${company ?? '(null)'}" ` +
        `role="${role ?? '(null)'}" url=${pageUrl}`,
      );
    } catch (err) {
      // Non-fatal – log and swallow.
      console.warn('[DVantage AutofillPanel] REQUEST_CAPTURE prep failed:', err);
    }
  })();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldRow({ field, profile }: { field: AutofillPreviewField; profile: UserProfile }) {
  const value = getProfileValue(field.profileKey, profile);

  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: '110px 1fr',
      gap:                 '0 8px',
      alignItems:          'baseline',
      padding:             '5px 0',
      borderBottom:        '1px solid var(--vt-border)',
    }}>
      <span style={{
        fontSize:      '11px',
        color:         'var(--vt-text-muted)',
        fontWeight:    500,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        lineHeight:    '1.4',
      }}>
        {field.label}
        {field.required && <span style={{ color: 'var(--vt-danger)', marginLeft: 2 }}>*</span>}
      </span>

      <span style={{
        fontSize:   '12px',
        color:      value ? 'var(--vt-text)' : 'var(--vt-text-muted)',
        fontStyle:  value ? 'normal' : 'italic',
        lineHeight: '1.4',
        wordBreak:  'break-word',
      }}>
        {value ?? '\u2013 not set'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AutofillPanel() {
  const [state, setState] = useState<PanelState>({ status: 'idle' });
  const activeFormRef     = useRef<ActiveForm | null>(null);

  // ── Bootstrap: read ACTIVE_FORM from storage on mount ──────────────────────
  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEYS.ACTIVE_FORM], (result) => {
      const form = result[STORAGE_KEYS.ACTIVE_FORM] as ActiveForm | null | undefined;
      if (form && form.fieldCount > 0) {
        activeFormRef.current = form;
        loadProfile(form);
      }
    });
  }, []);

  // ── React to ACTIVE_FORM changes ───────────────────────────────────────────
  useEffect(() => {
    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
    ): void {
      if (!(STORAGE_KEYS.ACTIVE_FORM in changes)) return;

      const newVal = changes[STORAGE_KEYS.ACTIVE_FORM]?.newValue as ActiveForm | null | undefined;

      if (!newVal || newVal.fieldCount === 0) {
        activeFormRef.current = null;
        setState({ status: 'idle' });
        return;
      }

      activeFormRef.current = newVal;
      setState({ status: 'loading' });
      loadProfile(newVal);
    }

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  // ── Profile fetch ──────────────────────────────────────────────────────────
  function loadProfile(form: ActiveForm): void {
    setState({ status: 'loading' });

    chrome.runtime.sendMessage({ type: 'REQUEST_PROFILE' }, (response: unknown) => {
      if (chrome.runtime.lastError) {
        setState({ status: 'error', message: 'Could not load your profile. Please try again.' });
        return;
      }

      const resp = response as { ok: boolean; profile?: UserProfile; error?: string };

      if (!resp.ok || !resp.profile) {
        setState({
          status:  'error',
          message: resp.error === 'not_authenticated'
            ? 'You are signed out. Please sign in again.'
            : 'Could not load your profile. Please try again.',
        });
        return;
      }

      setState({ status: 'ready', form, profile: resp.profile });
    });
  }

  // ── Autofill trigger ───────────────────────────────────────────────────────
  function handleAutofill(): void {
    const form = activeFormRef.current;
    if (!form) return;

    setState({ status: 'filling' });

    chrome.runtime.sendMessage(
      { type: 'REQUEST_AUTOFILL', payload: { pageUrl: form.pageUrl } },
      (response: unknown) => {
        if (chrome.runtime.lastError) {
          setState({ status: 'error', message: 'Autofill failed. Please try again.' });
          return;
        }

        const resp = response as {
          ok:            boolean;
          fieldsFilled?: number;
          skipped?:      string[];
          error?:        string;
        };

        if (!resp.ok) {
          setState({
            status:  'error',
            message: resp.error === 'no_active_tab'
              ? 'Could not reach the job page. Please reload the tab and try again.'
              : 'Autofill encountered an error. Please try again.',
          });
          return;
        }

        // Transition to complete immediately – DO NOT await capture
        setState({
          status:  'complete',
          filled:  resp.fieldsFilled ?? 0,
          skipped: resp.skipped      ?? [],
        });

        // Fire-and-forget capture – runs after state update, no blocking
        fireCapture(form.pageUrl);
      },
    );
  }

  // ── Retry ──────────────────────────────────────────────────────────────────
  function handleRetry(): void {
    const form = activeFormRef.current;
    if (form) loadProfile(form);
    else setState({ status: 'idle' });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (state.status === 'idle') return null;

  return (
    <div style={{
      margin:       '12px 0 0',
      padding:      '14px',
      background:   'var(--vt-surface)',
      border:       '1px solid var(--vt-border)',
      borderRadius: '10px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <span style={{ fontSize: '15px' }}>✏️</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vt-text)' }}>
          Autofill
        </span>
      </div>

      {/* Loading */}
      {state.status === 'loading' && (
        <p style={{ fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0 }}>
          Loading your profile\u2026
        </p>
      )}

      {/* Filling */}
      {state.status === 'filling' && (
        <p style={{ fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0 }}>
          Filling fields\u2026
        </p>
      )}

      {/* Error */}
      {state.status === 'error' && (
        <div>
          <p style={{ fontSize: '12px', color: 'var(--vt-danger)', margin: '0 0 10px' }}>
            {state.message}
          </p>
          <button onClick={handleRetry} style={btnStyle('secondary')}>
            Try again
          </button>
        </div>
      )}

      {/* Ready – field-value preview */}
      {state.status === 'ready' && (
        <div>
          <p style={{ fontSize: '12px', color: 'var(--vt-text-muted)', margin: '0 0 8px' }}>
            <strong style={{ color: 'var(--vt-text)' }}>
              {state.form.fieldCount} field{state.form.fieldCount !== 1 ? 's' : ''} detected
            </strong>
            {state.form.unknownFieldCount > 0 && (
              <span style={{ color: 'var(--vt-warning)', marginLeft: 6 }}>
                &middot; ⚠ {state.form.unknownFieldCount} need{state.form.unknownFieldCount === 1 ? 's' : ''} review
              </span>
            )}
          </p>

          <div style={{ marginBottom: '12px' }}>
            {state.form.fillableFields.map((field) => (
              <FieldRow key={field.profileKey} field={field} profile={state.profile} />
            ))}
          </div>

          {state.form.fillableFields.some(
            (f) => !getProfileValue(f.profileKey, state.profile),
          ) && (
            <p style={{
              fontSize:     '11px',
              color:        'var(--vt-text-muted)',
              margin:       '0 0 10px',
              padding:      '6px 8px',
              background:   'var(--vt-bg)',
              borderRadius: '6px',
              borderLeft:   '3px solid var(--vt-warning)',
            }}>
              {/* D12 fix: replaced broken dvantage.ca/settings/profile link with gear-button copy */}
              Some fields are empty. Use the ⚙ button above to add them.
            </p>
          )}

          <button onClick={handleAutofill} style={btnStyle('primary')}>
            Autofill
          </button>
        </div>
      )}

      {/* Complete */}
      {state.status === 'complete' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <span style={{ fontSize: '16px' }}>\u2705</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vt-success)' }}>
              {state.filled} field{state.filled !== 1 ? 's' : ''} filled
            </span>
          </div>

          {state.skipped.length > 0 && (
            <div style={{
              marginBottom: '10px',
              padding:      '8px 10px',
              background:   'var(--vt-bg)',
              borderRadius: '6px',
              borderLeft:   '3px solid var(--vt-warning)',
            }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--vt-text)', margin: '0 0 4px' }}>
                \u26a0 {state.skipped.length} field{state.skipped.length !== 1 ? 's' : ''} need{state.skipped.length === 1 ? 's' : ''} review:
              </p>
              {state.skipped.map((label) => (
                <p key={label} style={{ fontSize: '11px', color: 'var(--vt-text-muted)', margin: '2px 0 0' }}>
                  &middot; {label}
                </p>
              ))}
            </div>
          )}

          {/* Review reminder – always shown */}
          <div style={{
            padding:      '8px 10px',
            background:   'var(--vt-bg)',
            borderRadius: '6px',
            borderLeft:   '3px solid var(--vt-primary)',
            marginBottom: '10px',
          }}>
            <p style={{ fontSize: '11px', color: 'var(--vt-text)', margin: 0, lineHeight: 1.5 }}>
              <strong>Review your answers before submitting.</strong>
              {' '}D&apos;Vantage never clicks submit for you.
            </p>
          </div>

          <button onClick={handleAutofill} style={btnStyle('secondary')}>
            Re-fill
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared button style helper
// ---------------------------------------------------------------------------

function btnStyle(variant: 'primary' | 'secondary'): CSSProperties {
  const isPrimary = variant === 'primary';
  return {
    width:         '100%',
    padding:       '9px 0',
    borderRadius:  '7px',
    border:        isPrimary ? 'none' : '1px solid var(--vt-border)',
    background:    isPrimary ? 'var(--vt-primary)' : 'transparent',
    color:         isPrimary ? '#fff' : 'var(--vt-text)',
    fontSize:      '13px',
    fontWeight:    600,
    cursor:        'pointer',
    letterSpacing: '0.01em',
  };
}
