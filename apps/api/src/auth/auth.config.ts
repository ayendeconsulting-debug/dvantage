import { uuidv7 }           from 'uuidv7';
import type { Redis }      from 'ioredis';
import type { DatabaseClient } from '@vantage/database';
import * as schema         from '@vantage/database';

// ---------------------------------------------------------------------------
// ESM bridge — loaded via require() so ts-node/SWC never sees the import()
// calls inside it. Node.js handles .cjs natively; import() there is genuine.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadBetterAuth } = require('./better-auth-loader.cjs') as {
  loadBetterAuth: () => Promise<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    betterAuth:     (...args: any[]) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drizzleAdapter: (...args: any[]) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    twoFactor:      (...args: any[]) => any;
  }>;
};

// ---------------------------------------------------------------------------
// Token for NestJS DI
// ---------------------------------------------------------------------------

export const AUTH_INSTANCE = Symbol('AUTH_INSTANCE');

/**
 * Structural interface for the better-auth instance.
 * Defined explicitly to avoid TS2742 (zod/v4/core internal type leak).
 */
export interface AuthInstance {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession(options: {
      headers: Headers;
      [key: string]: unknown;
    }): Promise<{
      session: Record<string, unknown>;
      user: Record<string, unknown>;
    } | null>;
  };
}

// ---------------------------------------------------------------------------
// Factory dependencies
// ---------------------------------------------------------------------------

export interface AuthFactoryDeps {
  db:    DatabaseClient;
  redis: Redis;
  env: {
    authSecret:            string;
    apiUrl:                string;
    appUrl:                string;
    googleClientId:        string;
    googleClientSecret:    string;
    microsoftClientId:     string;
    microsoftClientSecret: string;
  };
  encryptToken:           (value: string) => Promise<string>;
  sendVerificationEmail:  (email: string, url: string) => Promise<void>;
  sendPasswordResetEmail: (email: string, url: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createAuth(deps: AuthFactoryDeps): Promise<AuthInstance> {
  // Load ESM-only better-auth through the CJS bridge
  const { betterAuth, drizzleAdapter, twoFactor } = await loadBetterAuth();

  const { db, redis, env } = deps;

  return betterAuth({
    secret:   env.authSecret,
    baseURL:  env.apiUrl,
    basePath: '/api/auth',

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user:         schema.users,
        session:      schema.sessions,
        account:      schema.accounts,
        verification: schema.verificationTokens,
        twoFactor:    schema.twoFactor,
      },
    }),

    secondaryStorage: {
      get: (key: string) =>
        redis.get(key),
      set: async (key: string, value: string, ttl?: number) => {
        if (ttl) await redis.setex(key, ttl, value);
        else     await redis.set(key, value);
      },
      delete: (key: string) =>
        redis.del(key).then(() => undefined),
    },

    session: {
      expiresIn:   30 * 24 * 60 * 60,
      updateAge:       24 * 60 * 60,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    advanced: {
      useSecureCookies: process.env['NODE_ENV'] === 'production',
      cookiePrefix:     'dvantage',
      generateId:       () => uuidv7(),
    },

    trustedOrigins: [
      env.appUrl,
      'http://localhost:3000',
      'http://localhost:3001',
    ],

    emailAndPassword: {
      enabled:                  true,
      requireEmailVerification: true,
      minPasswordLength:        8,
      sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
        await deps.sendPasswordResetEmail(user.email, url);
      },
    },

    emailVerification: {
      sendOnSignUp:                true,
      autoSignInAfterVerification: true,
      // Redirect to the web app after verification — not the API (port 3001)
      callbackURL: `${env.appUrl}/dashboard`,
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
        await deps.sendVerificationEmail(user.email, url);
      },
    },

    socialProviders: {
      google: {
        clientId:     env.googleClientId,
        clientSecret: env.googleClientSecret,
      },
      microsoft: {
        clientId:     env.microsoftClientId,
        clientSecret: env.microsoftClientSecret,
      },
    },

    plugins: [
      twoFactor({ issuer: "D'Vantage" }),
    ],

    databaseHooks: {
      account: {
        create: {
          before: async (account: Record<string, unknown>) => ({
            data: {
              ...account,
              accessToken: account['accessToken']
                ? await deps.encryptToken(String(account['accessToken']))
                : account['accessToken'],
              refreshToken: account['refreshToken']
                ? await deps.encryptToken(String(account['refreshToken']))
                : account['refreshToken'],
            },
          }),
        },
        update: {
          before: async (data: Record<string, unknown>) => ({
            data: {
              ...data,
              ...(data['accessToken']
                ? { accessToken: await deps.encryptToken(String(data['accessToken'])) }
                : {}),
              ...(data['refreshToken']
                ? { refreshToken: await deps.encryptToken(String(data['refreshToken'])) }
                : {}),
            },
          }),
        },
      },
    },
  }) as unknown as AuthInstance;
}
