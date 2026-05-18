'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader, AlertCircle, CheckCircle2, Phone, Link2, User } from 'lucide-react';
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

  const isDirty =
    phone.trim()       !== (profile?.phone       ?? '') ||
    linkedinUrl.trim() !== (profile?.linkedinUrl ?? '');

  const linkedinError =
    linkedinUrl.trim().length > 0 && !isValidLinkedInUrl(linkedinUrl.trim())
      ? 'Must be a LinkedIn profile URL (linkedin.com/in/…)'
      : null;

  const canSave = isDirty && !linkedinError && saveState !== 'saving';

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
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (err) {
      setSaveError((err as Error).message);
      setSaveState('error');
    }
  }

  return (
    <div style={{ maxWidth: '560px' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .profile-input {
          width: 100%;
          padding: 10px 12px 10px 38px;
          background: #ffffff;
          border: 1.5px solid #d1d5db;
          border-radius: 8px;
          color: #111827;
          font-family: var(--vt-font-body);
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 150ms, box-shadow 150ms;
        }
        .profile-input:focus {
          border-color: var(--vt-brand-500);
          box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
        }
        .profile-input::placeholder { color: #9ca3af; }
        .profile-input.error {
          border-color: #ef4444;
          box-shadow: 0 0 0 3px rgba(239,68,68,0.10);
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '8px',
            backgroundColor: 'var(--vt-brand-500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <User size={18} strokeWidth={1.8} color="#ffffff" />
          </div>
          <h1 style={{
            fontFamily: 'var(--vt-font-display)', fontSize: '22px',
            fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '-0.02em',
          }}>
            Profile
          </h1>
        </div>
        <p style={{
          fontFamily: 'var(--vt-font-body)', fontSize: '14px',
          color: '#6b7280', margin: '0 0 0 48px', lineHeight: 1.5,
        }}>
          Contact details used by the D&apos;Vantage extension when autofilling job applications.
        </p>
      </div>

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '48px' }}>
          <Loader size={20} strokeWidth={1.5} style={{ color: '#9ca3af', animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {/* ── Fetch error ────────────────────────────────────────────────── */}
      {!loading && fetchErr && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '12px 16px', backgroundColor: '#fef2f2',
          border: '1px solid #fecaca', borderRadius: '8px',
          color: '#dc2626', fontFamily: 'var(--vt-font-body)', fontSize: '13px',
        }}>
          <AlertCircle size={14} strokeWidth={1.5} />{fetchErr}
        </div>
      )}

      {/* ── Form card ──────────────────────────────────────────────────── */}
      {!loading && !fetchErr && (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '28px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        }}>

          {/* Phone */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block', fontSize: '12px', fontWeight: 600,
              color: '#374151', marginBottom: '7px',
              letterSpacing: '0.03em', textTransform: 'uppercase',
              fontFamily: 'var(--vt-font-body)',
            }}>
              Phone number
            </label>
            <div style={{ position: 'relative' }}>
              <Phone
                size={15} strokeWidth={1.5}
                style={{
                  position: 'absolute', left: '11px', top: '50%',
                  transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none',
                }}
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setSaveState('idle'); }}
                placeholder="+1 416 555 0100"
                className="profile-input"
              />
            </div>
            <p style={{
              fontFamily: 'var(--vt-font-body)', fontSize: '12px',
              color: '#9ca3af', margin: '6px 0 0',
            }}>
              Include country code for best autofill results.
            </p>
          </div>

          {/* LinkedIn URL */}
          <div style={{ marginBottom: '28px' }}>
            <label style={{
              display: 'block', fontSize: '12px', fontWeight: 600,
              color: '#374151', marginBottom: '7px',
              letterSpacing: '0.03em', textTransform: 'uppercase',
              fontFamily: 'var(--vt-font-body)',
            }}>
              LinkedIn profile URL
            </label>
            <div style={{ position: 'relative' }}>
              <Link2
                size={15} strokeWidth={1.5}
                style={{
                  position: 'absolute', left: '11px', top: '50%',
                  transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none',
                }}
              />
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => { setLinkedinUrl(e.target.value); setSaveState('idle'); }}
                placeholder="https://linkedin.com/in/your-handle"
                className={`profile-input${linkedinError ? ' error' : ''}`}
              />
            </div>
            {linkedinError && (
              <p style={{
                fontFamily: 'var(--vt-font-body)', fontSize: '12px',
                color: '#ef4444', margin: '6px 0 0',
              }}>
                {linkedinError}
              </p>
            )}
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #f3f4f6', marginBottom: '20px' }} />

          {/* Save error */}
          {saveState === 'error' && saveError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', backgroundColor: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: '6px',
              color: '#dc2626', fontFamily: 'var(--vt-font-body)',
              fontSize: '13px', marginBottom: '16px',
            }}>
              <AlertCircle size={13} strokeWidth={1.5} />{saveError}
            </div>
          )}

          {/* Footer row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave}
              style={{
                display:         'inline-flex',
                alignItems:      'center',
                gap:             '7px',
                padding:         '9px 22px',
                backgroundColor: canSave ? 'var(--vt-brand-500)' : '#f3f4f6',
                color:           canSave ? '#ffffff' : '#9ca3af',
                border:          'none',
                borderRadius:    '7px',
                fontFamily:      'var(--vt-font-body)',
                fontSize:        '14px',
                fontWeight:      600,
                cursor:          canSave ? 'pointer' : 'not-allowed',
                transition:      'background 150ms, opacity 150ms',
                opacity:         saveState === 'saving' ? 0.75 : 1,
              }}
            >
              {saveState === 'saving' && (
                <Loader size={13} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
              )}
              {saveState === 'saving' ? 'Saving…' : 'Save changes'}
            </button>

            {saveState === 'saved' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                fontFamily: 'var(--vt-font-body)', fontSize: '13.5px',
                color: '#16a34a', fontWeight: 500,
              }}>
                <CheckCircle2 size={15} strokeWidth={1.8} />
                Saved
              </div>
            )}

            {saveState === 'idle' && isDirty && (
              <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12.5px', color: '#9ca3af' }}>
                Unsaved changes
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Footer note ────────────────────────────────────────────────── */}
      {!loading && !fetchErr && (
        <p style={{
          fontFamily: 'var(--vt-font-body)', fontSize: '12.5px',
          color: '#9ca3af', margin: '16px 0 0', lineHeight: 1.5,
        }}>
          Name and email are managed by your sign-in provider and cannot be changed here.
        </p>
      )}
    </div>
  );
}
