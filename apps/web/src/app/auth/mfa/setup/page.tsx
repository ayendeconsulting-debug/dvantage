'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AuthCard, AuthField, AuthButton, AuthError, AuthSuccess } from '@/components/auth/auth-ui';

type Step = 'password' | 'qr' | 'done';

export default function MfaSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (authClient as any).twoFactor.enable({ password });
    if (result?.error) {
      setError(result.error.message ?? 'Could not enable 2FA.');
    } else if (result?.data) {
      setTotpUri(result.data.totpURI ?? '');
      setSecret(result.data.secret ?? '');
      setStep('qr');
    }
    setLoading(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (authClient as any).twoFactor.verifyTotp({ code });
    if (result?.error) {
      setError(result.error.message ?? 'Invalid code.');
    } else {
      setStep('done');
    }
    setLoading(false);
  }

  if (step === 'done')
    return (
      <AuthCard title="Two-factor enabled" subtitle="Your account is now more secure.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <AuthSuccess message="Two-factor authentication is active." />
          <AuthButton type="button" onClick={() => router.push('/dashboard')}>
            Go to dashboard
          </AuthButton>
        </div>
      </AuthCard>
    );

  if (step === 'qr')
    return (
      <AuthCard title="Scan QR code" subtitle="Open your authenticator app and scan this code.">
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}
        >
          {totpUri && (
            <img
              src={
                'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' +
                encodeURIComponent(totpUri)
              }
              alt="TOTP QR code"
              width={180}
              height={180}
              style={{ borderRadius: '8px', background: '#fff', padding: '8px' }}
            />
          )}
          {secret && (
            <div
              style={{
                width: '100%',
                background: 'var(--vt-surface-overlay)',
                border: '1px solid var(--vt-surface-border)',
                borderRadius: '8px',
                padding: '12px 14px',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--vt-font-body)',
                  fontSize: 'var(--vt-text-xs)',
                  color: 'var(--vt-text-muted)',
                  margin: '0 0 4px',
                }}
              >
                Manual entry key
              </p>
              <code
                style={{
                  fontFamily: 'var(--vt-font-mono)',
                  fontSize: 'var(--vt-text-sm)',
                  color: 'var(--vt-text-primary)',
                  wordBreak: 'break-all',
                  display: 'block',
                  letterSpacing: '0.05em',
                }}
              >
                {secret}
              </code>
            </div>
          )}
          <form
            onSubmit={handleVerify}
            style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                style={{
                  fontFamily: 'var(--vt-font-body)',
                  fontSize: 'var(--vt-text-sm)',
                  fontWeight: 500,
                  color: 'var(--vt-text-secondary)',
                }}
              >
                Enter the 6-digit code to confirm
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                autoComplete="one-time-code"
                style={{
                  width: '100%',
                  background: 'var(--vt-surface-overlay)',
                  border: '1px solid var(--vt-surface-border)',
                  borderRadius: '8px',
                  color: 'var(--vt-text-primary)',
                  fontFamily: 'var(--vt-font-mono)',
                  fontSize: '28px',
                  fontWeight: 500,
                  letterSpacing: '0.3em',
                  padding: '14px 16px',
                  outline: 'none',
                  textAlign: 'center',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--vt-brand-500)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--vt-surface-border)';
                }}
              />
            </div>
            {error && (
              <p
                style={{
                  fontFamily: 'var(--vt-font-body)',
                  fontSize: 'var(--vt-text-sm)',
                  color: 'var(--vt-status-danger)',
                  margin: 0,
                  padding: '10px 12px',
                  background: 'rgba(239,68,68,0.08)',
                  borderRadius: '6px',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                {error}
              </p>
            )}
            <AuthButton loading={loading}>Confirm setup</AuthButton>
          </form>
        </div>
      </AuthCard>
    );

  return (
    <AuthCard title="Enable two-factor auth" subtitle="Confirm your password to continue.">
      <form
        onSubmit={handleEnable}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <AuthField
          label="Current password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
        {error && <AuthError message={error} />}
        <AuthButton loading={loading}>Continue</AuthButton>
      </form>
    </AuthCard>
  );
}
