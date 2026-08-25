'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AuthCard, AuthButton, AuthError } from '@/components/auth/auth-ui';

export default function MfaVerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (authClient as any).twoFactor.verifyTotp({ code });
    if (result?.error) {
      setError(result.error.message ?? 'Invalid code.');
    } else {
      router.push('/dashboard');
    }
    setLoading(false);
  }

  return (
    <AuthCard
      title="Two-factor authentication"
      subtitle="Enter the code from your authenticator app."
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label
            style={{
              fontFamily: 'var(--vt-font-body)',
              fontSize: 'var(--vt-text-sm)',
              fontWeight: 500,
              color: 'var(--vt-text-secondary)',
            }}
          >
            Authenticator code
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            autoFocus
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
        {error && <AuthError message={error} />}
        <AuthButton loading={loading}>Verify</AuthButton>
      </form>
    </AuthCard>
  );
}
