'use client';

import { useState }   from 'react';
import Link           from 'next/link';
import { useRouter }  from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import {
  AuthCard, AuthField, AuthButton, AuthError, AuthDivider, AuthLink,
} from '@/components/auth/auth-ui';

export default function SignUpPage() {
  const router = useRouter();

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'microsoft' | null>(null);

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);

    const result = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: '/dashboard',
    });

    if (result.error) {
      setError(result.error.message ?? 'Registration failed.');
    } else {
      router.push('/auth/verify-email?email=' + encodeURIComponent(email));
    }

    setLoading(false);
  }

  async function handleOAuth(provider: 'google' | 'microsoft') {
    setError('');
    setOauthLoading(provider);
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: `${appUrl}/dashboard`,
      });
      // better-auth redirects the browser — no further handling needed.
    } catch (err) {
      setError((err as Error).message ?? 'OAuth sign in failed.');
      setOauthLoading(null);
    }
  }

  return (
    <AuthCard title="Create account" subtitle="Start getting noticed.">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <AuthField
          label="Full name"
          value={name}
          onChange={setName}
          placeholder="Ada Lovelace"
          autoComplete="name"
          required
        />
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <div>
          <AuthField
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
          <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: 'var(--vt-text-xs)', color: 'var(--vt-text-disabled)', margin: '6px 0 0' }}>
            Min 8 chars, one uppercase, one number.
          </p>
        </div>

        {error && <AuthError message={error} />}

        <AuthButton loading={loading}>Create account</AuthButton>
      </form>

      <AuthDivider />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
          type="button"
          onClick={() => void handleOAuth('google')}
          disabled={oauthLoading !== null}
          style={{ ...styles.oauthBtn, opacity: oauthLoading !== null ? 0.6 : 1, cursor: oauthLoading !== null ? 'not-allowed' : 'pointer' }}
        >
          {oauthLoading === 'google' ? <Spinner /> : <GoogleIcon />}
          {oauthLoading === 'google' ? 'Redirecting…' : 'Continue with Google'}
        </button>

        <button
          type="button"
          onClick={() => void handleOAuth('microsoft')}
          disabled={oauthLoading !== null}
          style={{ ...styles.oauthBtn, opacity: oauthLoading !== null ? 0.6 : 1, cursor: oauthLoading !== null ? 'not-allowed' : 'pointer' }}
        >
          {oauthLoading === 'microsoft' ? <Spinner /> : <MicrosoftIcon />}
          {oauthLoading === 'microsoft' ? 'Redirecting…' : 'Continue with Microsoft'}
        </button>
      </div>

      <AuthLink>
        Already have an account?{' '}
        <Link href="/auth/sign-in" style={styles.link}>Sign in</Link>
      </AuthLink>
    </AuthCard>
  );
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: '16px', height: '16px',
      border: '2px solid var(--vt-surface-border)',
      borderTopColor: 'var(--vt-brand-400)',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#F25022" d="M0 0h8.571v8.571H0z"/>
      <path fill="#7FBA00" d="M9.429 0H18v8.571H9.429z"/>
      <path fill="#00A4EF" d="M0 9.429h8.571V18H0z"/>
      <path fill="#FFB900" d="M9.429 9.429H18V18H9.429z"/>
    </svg>
  );
}

const styles = {
  oauthBtn: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '10px',
    width:          '100%',
    padding:        '10px 16px',
    background:     'transparent',
    border:         '1px solid var(--vt-surface-border)',
    borderRadius:   '8px',
    color:          'var(--vt-text-body)',
    fontFamily:     'var(--vt-font-body)',
    fontSize:       'var(--vt-text-base)',
    transition:     'border-color 120ms, background 120ms',
  },
  link: {
    color:          'var(--vt-brand-400)',
    textDecoration: 'none',
  },
} as const;
