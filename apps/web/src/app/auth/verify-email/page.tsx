'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AuthCard, AuthButton, AuthError, AuthSuccess } from '@/components/auth/auth-ui';

function VerifyEmailContent() {
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function resend() {
    setError(''); setLoading(true);
    const result = await authClient.sendVerificationEmail({ email, callbackURL: '/dashboard' });
    if (result.error) { setError(result.error.message ?? 'Could not resend.'); } else { setSent(true); }
    setLoading(false);
  }
  return (
    <AuthCard title="Check your email" subtitle={email ? 'We sent a link to ' + email + '.' : 'We sent you a verification link.'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: 'var(--vt-text-base)', color: 'var(--vt-text-secondary)', margin: 0, lineHeight: 1.6 }}>
          Click the link in the email to verify your address and activate your account. The link expires in 24 hours.
        </p>
        {sent  && <AuthSuccess message="Verification email resent. Check your inbox." />}
        {error && <AuthError   message={error} />}
        {!sent && <AuthButton type="button" variant="ghost" loading={loading} onClick={resend}>Resend verification email</AuthButton>}
        <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: 'var(--vt-text-sm)', color: 'var(--vt-text-muted)', margin: 0, textAlign: 'center' }}>
          Wrong address? <a href="/auth/sign-up" style={{ color: 'var(--vt-brand-400)', textDecoration: 'none' }}>Start over</a>
        </p>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthCard title="Loading..." subtitle=""><span /></AuthCard>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
