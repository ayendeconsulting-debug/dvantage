'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader, AlertCircle, CheckCircle2, Phone, Link2 } from 'lucide-react';
import { getUserProfile, updateUserProfile } from '@/lib/api/user-profile';
import type { UserProfileData } from '@/lib/api/user-profile';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidLinkedInUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === 'linkedin.com' || parsed.hostname === 'www.linkedin.com') &&
      parsed.pathname.startsWith('/in/')
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function ProfileSettingsPage() {
  const [profile,   setProfile]   = useState<UserProfileData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [fetchErr,  setFetchErr]  = useState<string | null>(null);

  const [phone,       setPhone]       = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [saveState,   setSaveState]   = useState<SaveState>('idle');
  const [saveError,   setSaveError]   = useState<string | null>(null);

  // -- Load profile on mount ------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    setFetchErr(null);
    try {
      const data = await getUserProfile();
      setProfile(data);
      setPhone(data.phone ?? '');
      setLinkedinUrl(data.linkedinUrl ?? '');
    } catch (err) {
      setFetchErr((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // -- Dirty check ----------------------------------------------------------

  const isDirty =
    phone.trim()       !== (profile?.phone       ?? '') ||
    linkedinUrl.trim() !== (profile?.linkedinUrl ?? '');

  // -- Validation -----------------------------------------------------------

  const linkedinError =
    linkedinUrl.trim().length > 0 && !isValidLinkedInUrl(linkedinUrl.trim())
      ? 'Must be a LinkedIn profile URL (linkedin.com/in/…)'
      : null;

  const canSave = isDirty && !linkedinError && saveState !== 'saving';

  // -- Save -----------------------------------------------------------------

  async function handleSave() {
    if (!canSave) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      const updated = await updateUserProfile({
        phone:       phone.trim()       || null,
        linkedinUrl: linkedinUrl.trim() || null,
      });
      setProfile(updated);
      setPhone(updated.phone ?? '');
      setLinkedinUrl(updated.linkedinUrl ?? '');
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1800);
    } catch (err) {
      setSaveError((err as Error).message);
      setSaveState('error');
    }
  }

  // -- Styles ---------------------------------------------------------------

  const inputStyle: React.CSSProperties = {
    width:           '100%',
    padding:         '8px 10px 8px 36px',
    backgroundColor: 'var(--vt-surface-overlay)',
    border:          '1px solid var(--vt-surface-border)',
    borderRadius:    '6px',
    color:           'var(--vt-text-primary)',
    fontFamily:      'var(--vt-font-body)',
    fontSize:        '13.5px',
    outline:         'none',
    boxSizing:       'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display:       'block',
    fontSize:      '11px',
    fontWeight:    500,
    color:         'var(--vt-text-muted)',
    marginBottom:  '5px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    fontFamily:    'var(--vt-font-body)',
  };

  // -- Render ---------------------------------------------------------------

  return (
    <div style={{ maxWidth: '520px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontFamily: 'var(--vt-font-display)', fontSize: '22px', fontWeight: 600, color: 'var(--vt-text-primary)', margin: 0 }}>
          Profile
        </h1>
        <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-muted)', margin: '4px 0 0' }}>
          Contact details used by the D&apos;Vantage extension when autofilling job applications.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '48px' }}>
          <Loader size={20} strokeWidth={1.5} style={{ color: 'var(--vt-text-muted)', animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {/* Fetch error */}
      {!loading && fetchErr && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: '#2e0a0a', border: '1px solid var(--vt-status-danger)', borderRadius: '8px', color: 'var(--vt-status-danger)', fontFamily: 'var(--vt-font-body)', fontSize: '13px' }}>
          <AlertCircle size={14} strokeWidth={1.5} />{fetchErr}
        </div>
      )}

      {/* Form */}
      {!loading && !fetchErr && (
        <div style={{ border: '1px solid var(--vt-surface-border)', borderRadius: '10px', backgroundColor: 'var(--vt-surface-raised)', padding: '24px' }}>

          {/* Phone */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Phone number</label>
            <div style={{ position: 'relative' }}>
              <Phone
                size={14}
                strokeWidth={1.5}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vt-text-muted)', pointerEvents: 'none' }}
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setSaveState('idle'); }}
                placeholder="+1 416 555 0100"
                style={inputStyle}
              />
            </div>
            <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '11.5px', color: 'var(--vt-text-disabled)', margin: '5px 0 0' }}>
              Include country code for best autofill results.
            </p>
          </div>

          {/* LinkedIn URL */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>LinkedIn profile URL</label>
            <div style={{ position: 'relative' }}>
              <Link2
                size={14}
                strokeWidth={1.5}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vt-text-muted)', pointerEvents: 'none' }}
              />
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => { setLinkedinUrl(e.target.value); setSaveState('idle'); }}
                placeholder="https://linkedin.com/in/your-handle"
                style={{
                  ...inputStyle,
                  borderColor: linkedinError ? 'var(--vt-status-danger)' : 'var(--vt-surface-border)',
                }}
              />
            </div>
            {linkedinError && (
              <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '11.5px', color: 'var(--vt-status-danger)', margin: '5px 0 0' }}>
                {linkedinError}
              </p>
            )}
          </div>

          {/* Save error */}
          {saveState === 'error' && saveError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: '#2e0a0a', border: '1px solid var(--vt-status-danger)', borderRadius: '6px', color: 'var(--vt-status-danger)', fontFamily: 'var(--vt-font-body)', fontSize: '13px', marginBottom: '16px' }}>
              <AlertCircle size={13} strokeWidth={1.5} />{saveError}
            </div>
          )}

          {/* Save button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave}
              style={{
                display:         'inline-flex',
                alignItems:      'center',
                gap:             '7px',
                padding:         '8px 20px',
                backgroundColor: canSave ? 'var(--vt-brand-500)' : 'var(--vt-surface-overlay)',
                color:           canSave ? '#ffffff' : 'var(--vt-text-disabled)',
                border:          'none',
                borderRadius:    '6px',
                fontFamily:      'var(--vt-font-body)',
                fontSize:        '13.5px',
                fontWeight:      500,
                cursor:          canSave ? 'pointer' : 'not-allowed',
                transition:      'background 120ms',
              }}
            >
              {saveState === 'saving' && (
                <Loader size={13} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
              )}
              {saveState === 'saving' ? 'Saving…' : 'Save changes'}
            </button>

            {/* Saved confirmation */}
            {saveState === 'saved' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-status-success)' }}>
                <CheckCircle2 size={14} strokeWidth={1.5} />
                Saved
              </div>
            )}
          </div>

        </div>
      )}

      {/* Info note */}
      {!loading && !fetchErr && (
        <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-disabled)', margin: '16px 0 0' }}>
          Name and email are managed by your sign-in provider and cannot be changed here.
        </p>
      )}
    </div>
  );
}
