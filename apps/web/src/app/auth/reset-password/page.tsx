'use client';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AuthCard, AuthField, AuthButton, AuthError, AuthSuccess, AuthLink } from '@/components/auth/auth-ui';

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Minimum 8 characters.'); return; }
    setLoading(true);
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result.error) { setError(result.error.message ?? 'Reset failed. The link may have expired.'); }
    else { setSuccess(true); setTimeout(() => router.push('/auth/sign-in'), 2500); }
    setLoading(false);
  }
  if (!token) return (
    <AuthCard title="Invalid link" subtitle="This reset link is missing or expired.">
      <AuthLink><Link href="/auth/forgot-password" style={{ color: 'var(--vt-brand-400)', textDecoration: 'none' }}>Request a new link</Link></AuthLink>
    </AuthCard>
  );
  return (
    <AuthCard title="Choose new password" subtitle="Pick something strong.">
      {success ? <AuthSuccess message="Password updated. Redirecting..." /> : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <AuthField label="New password" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" required />
          <AuthField label="Confirm password" type="password" value={confirm} onChange={setConfirm} placeholder="Repeat password" autoComplete="new-password" required />
          {error && <AuthError message={error} />}
          <AuthButton loading={loading}>Update password</AuthButton>
        </form>
      )}
      <AuthLink>Back to <Link href="/auth/sign-in" style={{ color: 'var(--vt-brand-400)', textDecoration: 'none' }}>sign in</Link></AuthLink>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthCard title="Loading..." subtitle=""><span /></AuthCard>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
