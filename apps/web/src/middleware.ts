import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware route guard.
 *
 * Strategy: check for the better-auth session cookie (set with cookiePrefix
 * "dvantage" → cookie name "dvantage.session_token"). This is a fast
 * cookie-presence check — no API call per request. The actual session
 * validation happens server-side in better-auth on every /api/auth/* call.
 *
 * Public paths bypass auth entirely.
 * Authenticated users visiting auth pages are sent to /dashboard.
 */

const SESSION_COOKIE = 'dvantage.session_token';

const PUBLIC_PATHS = [
  '/',
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/mfa/verify',
];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Let Next.js internals and static files through unconditionally
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const isPublic      = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const hasSession    = request.cookies.has(SESSION_COOKIE);

  // Unauthenticated user hitting a protected route → sign in
  if (!isPublic && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/sign-in';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated user hitting an auth page (except verify-email, MFA) → dashboard
  const authOnlyPaths = ['/auth/sign-in', '/auth/sign-up', '/auth/forgot-password'];
  if (authOnlyPaths.some((p) => pathname.startsWith(p)) && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.svg).*)'],
};
