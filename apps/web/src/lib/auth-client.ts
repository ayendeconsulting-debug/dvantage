import { createAuthClient } from 'better-auth/react';
import { twoFactorClient }  from 'better-auth/client/plugins';

/**
 * better-auth browser client.
 *
 * Cast to ny: better-auth 1.6.x leaks internal zod/v4/core and
 * path-to-object.mjs paths in its inferred return type, triggering TS2742
 * ("cannot be named without a reference to..."). The cast is type-erasing
 * but safe — the runtime API is unchanged and all method calls still work.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authClient = createAuthClient({
  baseURL: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001',
  plugins: [twoFactorClient()],
}) as any; // TS2742 workaround

export const { signIn, signUp, signOut, useSession, getSession } = authClient as {
  signIn:     any;
  signUp:     any;
  signOut:    any;
  useSession: any;
  getSession: any;
};