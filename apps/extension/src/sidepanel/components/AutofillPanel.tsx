// AutofillPanel — D13 Tier C: confirming-submit, submitting, submitted states
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { STORAGE_KEYS } from '../../shared/constants';
import type { ActiveForm, AutofillFieldKey, AutofillPreviewField, ExtractedJob, SkippedField, UserProfile } from '../../shared/types';

type PanelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; form: ActiveForm; profile: UserProfile }
  | { status: 'filling' }
  | { status: 'ai-filling' }
  | { status: 'complete';           filled: number; aiFilled: number; skipped: SkippedField[] }
  | { status: 'confirming-submit';  filled: number; aiFilled: number; skipped: SkippedField[] }
  | { status: 'submitting' }
  | { status: 'submitted' }
  | { status: 'error'; message: string };

function getProfileValue(profileKey: AutofillFieldKey, profile: UserProfile): string | null {
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
      const deg = edu.degree?.trim();
      return deg ? (edu.field?.trim() ? `${deg} in ${edu.field}` : deg) : null;
    }
    case 'graduationYear': {
      const edu = profile.education?.[0];
      if (!edu?.endDate) return null;
      const m = String(edu.endDate).match(/\b(20\d{2}|19\d{2})\b/);
      return m?.[1] ?? null;
    }
    case 'topSkills': return (profile.topSkills ?? []).length > 0 ? profile.topSkills.join(', ') : null;
    case 'summary': { const s = profile.summary; if (!s) return null; return s.length > 80 ? s.slice(0, 80) + '\u2026' : s; }
    default: return null;
  }
}

function fireCapture(pageUrl: string): void {
  void (async () => {
    try {
      const stored = await chrome.storage.local.get([STORAGE_KEYS.ACTIVE_JOB]);
      const j = stored[STORAGE_KEYS.ACTIVE_JOB] as ExtractedJob | null | undefined;
      chrome.runtime.sendMessage({ type: 'REQUEST_CAPTURE', payload: { company: j?.company ?? null, role: j?.title ?? null, pageUrl } }, () => { void chrome.runtime.lastError; });
    } catch { /* non-fatal */ }
  })();
}

function FieldRow({ field, profile }: { field: AutofillPreviewField; profile: UserProfile }) {
  const value = getProfileValue(field.profileKey, profile);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0 10px', alignItems: 'start', padding: '7px 0', borderBottom: '1px solid var(--vt-border)' }}>
      <span style={{ fontSize: '10px', color: 'var(--vt-text-secondary)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: '1.8' }}>
        {field.label}{field.required && <span style={{ color: 'var(--vt-danger)', marginLeft: 2 }}>*</span>}
      </span>
      <span style={{ fontSize: '13px', color: value ? 'var(--vt-text)' : 'var(--vt-text-disabled)', fontStyle: value ? 'normal' : 'italic', lineHeight: '1.5', wordBreak: 'break-word' }}>
        {value ?? '\u2013 not set'}
      </span>
    </div>
  );
}

function ManualFieldRow({ field }: { field: { label: string; required: boolean } }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0 10px', alignItems: 'start', padding: '7px 0', borderBottom: '1px solid var(--vt-border)' }}>
      <span style={{ fontSize: '10px', color: 'var(--vt-text-secondary)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: '1.8' }}>
        {field.label}{field.required && <span style={{ color: 'var(--vt-danger)', marginLeft: 2 }}>*</span>}
      </span>
      <span style={{ fontSize: '13px', color: 'var(--vt-warning)', lineHeight: '1.5', display: 'flex', alignItems: 'center', gap: '4px' }}><span>📎</span><span>Manual upload required</span></span>
    </div>
  );
}

export default function AutofillPanel() {
  const [state, setState] = useState<PanelState>({ status: 'idle' });
  const activeFormRef = useRef<ActiveForm | null>(null);
  const profileRef    = useRef<UserProfile | null>(null);

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEYS.ACTIVE_FORM], (result) => {
      const form = result[STORAGE_KEYS.ACTIVE_FORM] as ActiveForm | null | undefined;
      if (form && form.fieldCount > 0) { activeFormRef.current = form; loadProfile(form); }
    });
  }, []);

  useEffect(() => {
    function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>): void {
      if (!(STORAGE_KEYS.ACTIVE_FORM in changes)) return;
      const newVal = changes[STORAGE_KEYS.ACTIVE_FORM]?.newValue as ActiveForm | null | undefined;
      if (!newVal || newVal.fieldCount === 0) { activeFormRef.current = null; profileRef.current = null; setState({ status: 'idle' }); return; }
      activeFormRef.current = newVal;
      loadProfile(newVal);
    }
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  function loadProfile(form: ActiveForm): void {
    setState({ status: 'loading' });
    chrome.runtime.sendMessage({ type: 'REQUEST_PROFILE' }, (response: unknown) => {
      if (chrome.runtime.lastError) { setState({ status: 'error', message: 'Could not load your profile. Please try again.' }); return; }
      const resp = response as { ok: boolean; profile?: UserProfile; error?: string };
      if (!resp.ok || !resp.profile) { setState({ status: 'error', message: resp.error === 'not_authenticated' ? 'You are signed out. Please sign in again.' : 'Could not load your profile. Please try again.' }); return; }
      profileRef.current = resp.profile;
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
        if (chrome.runtime.lastError) { setState({ status: 'error', message: 'Autofill failed. Please try again.' }); return; }
        const resp = response as { ok: boolean; fieldsFilled?: number; skipped?: SkippedField[]; error?: string };
        if (!resp.ok) { setState({ status: 'error', message: resp.error === 'no_active_tab' ? 'Could not reach the job page. Please reload the tab and try again.' : 'Autofill encountered an error. Please try again.' }); return; }

        const fieldsFilled = resp.fieldsFilled ?? 0;
        const skipped      = resp.skipped      ?? [];

        if (skipped.length > 0) {
          setState({ status: 'ai-filling' });
          const resumeId = profileRef.current?.defaultResumeId ?? null;
          chrome.runtime.sendMessage(
            { type: 'REQUEST_AI_FILL', payload: { resumeId, fields: skipped } },
            (aiFillResp: unknown) => {
              void chrome.runtime.lastError;
              const r = aiFillResp as { ok?: boolean; aiFilled?: number; remaining?: SkippedField[] } | null | undefined;
              setState({ status: 'complete', filled: fieldsFilled + (r?.aiFilled ?? 0), aiFilled: r?.aiFilled ?? 0, skipped: r?.remaining ?? skipped });
              fireCapture(form.pageUrl);
            },
          );
        } else {
          setState({ status: 'complete', filled: fieldsFilled, aiFilled: 0, skipped: [] });
          fireCapture(form.pageUrl);
        }
      },
    );
  }

  // D13 Tier C: first click on Submit → confirming-submit state
  function handleSubmitRequest(): void {
    if (state.status !== 'complete') return;
    setState({ status: 'confirming-submit', filled: state.filled, aiFilled: state.aiFilled, skipped: state.skipped });
  }

  // D13 Tier C: second click → actually submit
  function handleSubmitConfirm(): void {
    setState({ status: 'submitting' });
    chrome.runtime.sendMessage({ type: 'REQUEST_SUBMIT' }, (response: unknown) => {
      void chrome.runtime.lastError;
      const resp = response as { ok: boolean; error?: string } | null | undefined;
      if (resp?.ok) {
        setState({ status: 'submitted' });
      } else {
        // Submit button not found or click failed — degrade gracefully
        setState({ status: 'error', message: 'Could not find the submit button. Please submit the form manually.' });
      }
    });
  }

  function handleSubmitCancel(): void {
    if (state.status !== 'confirming-submit') return;
    setState({ status: 'complete', filled: state.filled, aiFilled: state.aiFilled, skipped: state.skipped });
  }

  function handleRetry(): void { const form = activeFormRef.current; if (form) loadProfile(form); else setState({ status: 'idle' }); }

  if (state.status === 'idle') return null;

  return (
    <div style={{ margin: '12px 0 0', padding: '14px', background: 'var(--vt-surface)', border: '1px solid var(--vt-border)', borderRadius: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <span style={{ fontSize: '15px' }}>✏️</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vt-text)' }}>Autofill</span>
      </div>

      {state.status === 'loading'     && <p style={{ fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0 }}>Loading your profile&hellip;</p>}
      {state.status === 'filling'     && <p style={{ fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0 }}>Filling fields&hellip;</p>}
      {state.status === 'ai-filling'  && <p style={{ fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0 }}>✨ AI filling remaining fields&hellip;</p>}
      {state.status === 'submitting'  && <p style={{ fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0 }}>Submitting application&hellip;</p>}

      {state.status === 'submitted' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '18px' }}>🎉</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vt-success)' }}>Application submitted!</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--vt-text-muted)', margin: '0 0 12px' }}>
            Your application has been recorded in your dashboard.
          </p>
          <button onClick={() => setState({ status: 'idle' })} style={btnStyle('secondary')}>Done</button>
        </div>
      )}

      {state.status === 'error' && (
        <div>
          <p style={{ fontSize: '12px', color: 'var(--vt-danger)', margin: '0 0 10px' }}>{state.message}</p>
          <button onClick={handleRetry} style={btnStyle('secondary')}>Try again</button>
        </div>
      )}

      {state.status === 'ready' && (() => {
        const manualFields = state.form.manualFields ?? [];
        return (
          <div>
            <p style={{ fontSize: '12px', color: 'var(--vt-text-muted)', margin: '0 0 8px' }}>
              <strong style={{ color: 'var(--vt-text)' }}>{state.form.fieldCount} field{state.form.fieldCount !== 1 ? 's' : ''} detected</strong>
              {state.form.unknownFieldCount > 0 && <span style={{ color: 'var(--vt-warning)', marginLeft: 6 }}>&middot; &#9888; {state.form.unknownFieldCount} need{state.form.unknownFieldCount === 1 ? 's' : ''} review</span>}
            </p>
            <div style={{ marginBottom: '12px' }}>
              {state.form.fillableFields.map((f) => <FieldRow key={f.profileKey} field={f} profile={state.profile} />)}
              {manualFields.map((f) => <ManualFieldRow key={f.label} field={f} />)}
            </div>
            {state.form.fillableFields.some((f) => !getProfileValue(f.profileKey, state.profile)) && (
              <p style={{ fontSize: '11px', color: 'var(--vt-text-muted)', margin: '0 0 10px', padding: '6px 8px', background: 'var(--vt-bg)', borderRadius: '6px', borderLeft: '3px solid var(--vt-warning)' }}>
                Some fields are empty. Use the &#9881; button above to add them.
              </p>
            )}
            <button onClick={handleAutofill} style={btnStyle('primary')}>Autofill</button>
          </div>
        );
      })()}

      {(state.status === 'complete' || state.status === 'confirming-submit') && (() => {
        const isConfirming = state.status === 'confirming-submit';
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <span style={{ fontSize: '16px' }}>✅</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vt-success)' }}>
                {state.filled} field{state.filled !== 1 ? 's' : ''} filled
                {state.aiFilled > 0 && <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--vt-text-muted)', marginLeft: 6 }}>({state.aiFilled} by AI ✨)</span>}
              </span>
            </div>

            {state.skipped.length > 0 && (
              <div style={{ marginBottom: '10px', padding: '8px 10px', background: 'var(--vt-bg)', borderRadius: '6px', borderLeft: '3px solid var(--vt-warning)' }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--vt-text)', margin: '0 0 4px' }}>&#9888; {state.skipped.length} field{state.skipped.length !== 1 ? 's' : ''} need{state.skipped.length === 1 ? 's' : ''} review:</p>
                {state.skipped.map((s) => <p key={s.label} style={{ fontSize: '11px', color: 'var(--vt-text-muted)', margin: '2px 0 0' }}>&middot; {s.label}</p>)}
              </div>
            )}

            {/* D13 Tier C: inline confirmation banner */}
            {isConfirming ? (
              <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', marginBottom: '10px' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vt-text)', margin: '0 0 4px' }}>Submit this application?</p>
                <p style={{ fontSize: '11px', color: 'var(--vt-text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
                  This will click the submit button on the form. Make sure you&apos;ve reviewed all answers first.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleSubmitConfirm} style={{ flex: 1, padding: '8px 0', borderRadius: '6px', border: 'none', background: 'var(--vt-danger)', color: '#fff', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>
                    Confirm — Submit Now
                  </button>
                  <button onClick={handleSubmitCancel} style={{ flex: 1, padding: '8px 0', borderRadius: '6px', border: '1px solid var(--vt-border)', background: 'transparent', color: 'var(--vt-text)', fontSize: '12.5px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ padding: '8px 10px', background: 'var(--vt-bg)', borderRadius: '6px', borderLeft: '3px solid var(--vt-primary)', marginBottom: '10px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--vt-text)', margin: 0, lineHeight: 1.5 }}>
                    <strong>Review your answers in the form before submitting.</strong>
                  </p>
                </div>
                {/* D13 Tier C: Submit Application button */}
                <button onClick={handleSubmitRequest} style={{ ...btnStyle('primary'), marginBottom: '8px' }}>
                  Submit Application
                </button>
              </>
            )}

            {!isConfirming && (
              <button onClick={handleAutofill} style={btnStyle('secondary')}>Re-fill</button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function btnStyle(variant: 'primary' | 'secondary'): CSSProperties {
  const isPrimary = variant === 'primary';
  return { width: '100%', padding: '9px 0', borderRadius: '7px', border: isPrimary ? 'none' : '1px solid var(--vt-border)', background: isPrimary ? 'var(--vt-primary)' : 'transparent', color: isPrimary ? '#fff' : 'var(--vt-text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.01em' };
}
