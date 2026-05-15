'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AuthCard, AuthField, AuthButton, AuthError, AuthLink } from '@/components/auth/auth-ui';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    const result = await authClient.signUp.email({ name, email, password, callbackURL: '/dashboard' });
    if (result.error) { setError(result.error.message ?? 'Registration failed.'); }
    else { router.push('/auth/verify-email?email=' + encodeURIComponent(email)); }
    setLoading(false);
  }

  return (
    <AuthCard title="Create account" subtitle="Start getting noticed.">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <AuthField label="Full name" value={name} onChange={setName} placeholder="Ada Lovelace" autoComplete="name" required />
        <AuthField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" required />
        <div>
          <AuthField label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" required />
          <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: 'var(--vt-text-xs)', color: 'var(--vt-text-disabled)', margin: '6px 0 0' }}>Min 8 chars, one uppercase, one number.</p>
        </div>
        {error && <AuthError message={error} />}
        <AuthButton loading={loading}>Create account</AuthButton>
      </form>
      <AuthLink>Already have an account?{' '}<Link href="/auth/sign-in" style={{ color: 'var(--vt-brand-400)', textDecoration: 'none' }}>Sign in</Link></AuthLink>
    </AuthCard>
  );
}