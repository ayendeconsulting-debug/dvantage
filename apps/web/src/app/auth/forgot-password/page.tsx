'use client';
import { useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import {
  AuthCard,
  AuthField,
  AuthButton,
  AuthError,
  AuthSuccess,
  AuthLink,
} from '@/components/auth/auth-ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const resp = await fetch(
      (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001') + '/api/auth/forget-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          redirectTo: window.location.origin + '/auth/reset-password',
        }),
      },
    );
    const data: { message?: string } = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      setError(data.message ?? 'Could not send reset email.');
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent)
    return (
      <AuthCard title="Check your email" subtitle={'We sent a reset link to ' + email + '.'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <AuthSuccess message="Password reset email sent. Expires in 1 hour." />
          <AuthLink>
            Back to{' '}
            <Link
              href="/auth/sign-in"
              style={{ color: 'var(--vt-brand-400)', textDecoration: 'none' }}
            >
              sign in
            </Link>
          </AuthLink>
        </div>
      </AuthCard>
    );

  return (
    <AuthCard title="Reset password" subtitle="We'll send you a reset link.">
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        {error && <AuthError message={error} />}
        <AuthButton loading={loading}>Send reset link</AuthButton>
      </form>
      <AuthLink>
        Remember it?{' '}
        <Link href="/auth/sign-in" style={{ color: 'var(--vt-brand-400)', textDecoration: 'none' }}>
          Sign in
        </Link>
      </AuthLink>
    </AuthCard>
  );
}
