import { uuidv7 }           from 'uuidv7';
import type { Redis }      from 'ioredis';
import type { DatabaseClient } from '@vantage/database';
import * as schema         from '@vantage/database';

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

export const AUTH_INSTANCE = Symbol('AUTH_INSTANCE');

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

export async function createAuth(deps: AuthFactoryDeps): Promise<AuthInstance> {
  const { betterAuth, drizzleAdapter, twoFactor } = await loadBetterAuth();

  const { db, redis, env } = deps;

  // Derive www variant so both dvantage.ca and www.dvantage.ca are trusted.
  const wwwAppUrl = env.appUrl.replace('https://', 'https://www.');

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
      wwwAppUrl,
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
