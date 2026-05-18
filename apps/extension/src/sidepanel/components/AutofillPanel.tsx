// ---------------------------------------------------------------------------
// AutofillPanel — D13 Tier A
//
// State machine:
//   idle → loading → ready → filling → complete → error
//
// D13 Tier A changes:
//   - skipped: string[] → SkippedField[] throughout (complete state + response)
//   - getProfileValue() updated with new AutofillFieldKey values:
//     location, github, currentTitle, currentCompany, university, degree,
//     graduationYear — powers the ready-state field preview for new probes
//   - Complete state renders skipped.map(s => s.label) for display
//   - profile.topSkills access is now safe (API renamed skills → topSkills)
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties }           from 'react';
import { STORAGE_KEYS }                from '../../shared/constants';
import type {
  ActiveForm,
  AutofillFieldKey,
  AutofillPreviewField,
  ExtractedJob,
  SkippedField,
  UserProfile,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready';    form: ActiveForm; profile: UserProfile }
  | { status: 'filling' }
  | { status: 'complete'; filled: number; skipped: SkippedField[] }
  | { status: 'error';    message: string };

// ---------------------------------------------------------------------------
// Profile value resolver — panel display variant
//
// Mirrors shared/profile-resolver.ts but with display-specific tweaks:
//   - summary is truncated to 80 chars for compact panel preview
//   - graduationYear is formatted as a standalone year string
// ---------------------------------------------------------------------------

function getProfileValue(
  profileKey: AutofillFieldKey,
  profile:    UserProfile,
): string | null {
  switch (profileKey) {
    case 'firstName':      return profile.firstName || null;
    case 'lastName':       return profile.lastName  || null;
    case 'fullName':       return `${profile.firstName} ${profile.lastName}`.trim() || null;
    case 'email':          return profile.email     || null;
    case 'phone':          return profile.phone;
    case 'linkedinUrl':    return profile.linkedinUrl;
    case 'github':         return profile.github;
    case 'location':       return profile.location;
    case 'currentRole':    return profile.currentRole;
    case 'currentTitle':   return profile.experience?.[0]?.title   ?? null;
    case 'currentCompany': return profile.experience?.[0]?.company  ?? null;
    case 'university':     return profile.education?.[0]?.institution ?? null;
    case 'degree': {
      const edu = profile.education?.[0];
      if (!edu) return null;
      const deg   = edu.degree?.trim();
      const field = edu.field?.trim();
      if (!deg) return null;
      return field ? `${deg} in ${field}` : deg;
    }
    case 'graduationYear': {
      const edu = profile.education?.[0];
      if (!edu?.endDate) return null;
      const match = String(edu.endDate).match(/\b(20\d{2}|19\d{2})\b/);
      return match?.[1] ?? null;
    }
    case 'topSkills':
      return (profile.topSkills ?? []).length > 0 ? profile.topSkills.join(', ') : null;
    case 'summary': {
      const s = profile.summary;
      if (!s) return null;
      return s.length > 80 ? s.slice(0, 80) + '\u2026' : s;
    }
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Capture helper — fire-and-forget
// ---------------------------------------------------------------------------

function fireCapture(pageUrl: string): void {
  void (async (): Promise<void> => {
    try {
      const stored    = await chrome.storage.local.get([STORAGE_KEYS.ACTIVE_JOB]);
      const activeJob = stored[STORAGE_KEYS.ACTIVE_JOB] as ExtractedJob | null | undefined;

      chrome.runtime.sendMessage(
        {
          type:    'REQUEST_CAPTURE',
          payload: {
            company: activeJob?.company ?? null,
            role:    activeJob?.title   ?? null,
            pageUrl,
          },
        },
        () => { void chrome.runtime.lastError; },
      );
    } catch (err) {
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

function ManualFieldRow({ field }: { field: { label: string; required: boolean } }) {
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
        color:      'var(--vt-warning)',
        lineHeight: '1.4',
        display:    'flex',
        alignItems: 'center',
        gap:        '4px',
      }}>
        <span>📎</span>
        <span>Manual upload required</span>
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

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEYS.ACTIVE_FORM], (result) => {
      const form = result[STORAGE_KEYS.ACTIVE_FORM] as ActiveForm | null | undefined;
      if (form && form.fieldCount > 0) {
        activeFormRef.current = form;
        loadProfile(form);
      }
    });
  }, []);

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
          skipped?:      SkippedField[];  // D13 Tier A: SkippedField[] not string[]
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

        setState({
          status:  'complete',
          filled:  resp.fieldsFilled ?? 0,
          skipped: resp.skipped      ?? [],
        });

        fireCapture(form.pageUrl);
      },
    );
  }

  function handleRetry(): void {
    const form = activeFormRef.current;
    if (form) loadProfile(form);
    else setState({ status: 'idle' });
  }

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

      {state.status === 'loading' && (
        <p style={{ fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0 }}>
          Loading your profile&hellip;
        </p>
      )}

      {state.status === 'filling' && (
        <p style={{ fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0 }}>
          Filling fields&hellip;
        </p>
      )}

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

      {state.status === 'ready' && (() => {
        const manualFields = state.form.manualFields ?? [];

        return (
          <div>
            <p style={{ fontSize: '12px', color: 'var(--vt-text-muted)', margin: '0 0 8px' }}>
              <strong style={{ color: 'var(--vt-text)' }}>
                {state.form.fieldCount} field{state.form.fieldCount !== 1 ? 's' : ''} detected
              </strong>
              {state.form.unknownFieldCount > 0 && (
                <span style={{ color: 'var(--vt-warning)', marginLeft: 6 }}>
                  &middot; &#9888; {state.form.unknownFieldCount} need{state.form.unknownFieldCount === 1 ? 's' : ''} review
                </span>
              )}
            </p>

            <div style={{ marginBottom: '12px' }}>
              {state.form.fillableFields.map((field) => (
                <FieldRow key={field.profileKey} field={field} profile={state.profile} />
              ))}
              {manualFields.map((field) => (
                <ManualFieldRow key={field.label} field={field} />
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
                Some fields are empty. Use the &#9881; button above to add them.
              </p>
            )}

            <button onClick={handleAutofill} style={btnStyle('primary')}>
              Autofill
            </button>
          </div>
        );
      })()}

      {state.status === 'complete' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <span style={{ fontSize: '16px' }}>✅</span>
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
                &#9888; {state.skipped.length} field{state.skipped.length !== 1 ? 's' : ''} need{state.skipped.length === 1 ? 's' : ''} review:
              </p>
              {/* D13 Tier A: skipped is SkippedField[] — use .label for display */}
              {state.skipped.map((s) => (
                <p key={s.label} style={{ fontSize: '11px', color: 'var(--vt-text-muted)', margin: '2px 0 0' }}>
                  &middot; {s.label}
                </p>
              ))}
            </div>
          )}

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
