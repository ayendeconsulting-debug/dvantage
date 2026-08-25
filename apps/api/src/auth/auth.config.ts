import { Logger } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import type { Redis } from 'ioredis';
import type { DatabaseClient } from '@vantage/database';
import * as schema from '@vantage/database';

/** Logger for the auth factory — createAuth is a plain function, not a provider. */
const authLogger = new Logger('AuthConfig');

/** Narrow unknown catch bindings to a printable message. */
function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadBetterAuth } = require('./better-auth-loader.cjs') as {
  loadBetterAuth: () => Promise<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    betterAuth: (...args: any[]) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drizzleAdapter: (...args: any[]) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    twoFactor: (...args: any[]) => any;
  }>;
};

export const AUTH_INSTANCE = Symbol('AUTH_INSTANCE');

export interface AuthInstance {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession(options: { headers: Headers; [key: string]: unknown }): Promise<{
      session: Record<string, unknown>;
      user: Record<string, unknown>;
    } | null>;
  };
}

export interface AuthFactoryDeps {
  db: DatabaseClient;
  redis: Redis;
  env: {
    authSecret: string;
    apiUrl: string;
    appUrl: string;
    googleClientId: string;
    googleClientSecret: string;
    microsoftClientId: string;
    microsoftClientSecret: string;
  };
  encryptToken: (value: string) => Promise<string>;
  sendVerificationEmail: (email: string, url: string) => Promise<void>;
  sendPasswordResetEmail: (email: string, url: string) => Promise<void>;
}

export async function createAuth(deps: AuthFactoryDeps): Promise<AuthInstance> {
  const { betterAuth, drizzleAdapter, twoFactor } = await loadBetterAuth();

  const { db, redis, env } = deps;

  // Derive www variant so both dvantage.ca and www.dvantage.ca are trusted.
  const wwwAppUrl = env.appUrl.replace('https://', 'https://www.');

  return betterAuth({
    secret: env.authSecret,
    baseURL: env.apiUrl,
    basePath: '/api/auth',

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verificationTokens,
        twoFactor: schema.twoFactor,
      },
    }),

    // Redis-backed session storage.
    //
    // INCIDENT 2026-08-24: these three functions propagated their errors. When
    // the Upstash database was archived, every session read and write threw,
    // and sign-in broke independently of the /health 503. A cache being gone
    // must never throw into the request path.
    //
    // Each call now fails soft. A failed get() returns null, which better-auth
    // treats as a cache miss rather than as "no session".
    //
    // storeSessionInDatabase is deliberately NOT set. better-auth falls back to
    // reading the session from Postgres only when that option is falsy:
    //   if (!sessionStringified && !options.session?.storeSessionInDatabase)
    // Setting it true would DISABLE the database fallback — the opposite of
    // what this change is for. Leaving it at the default keeps that path live.
    //
    // VERIFY DELIBERATELY (infra/valkey/README.md step 4): sign in, stop the
    // Valkey machine, reload the dashboard. Expected: session survives via
    // Postgres and the API keeps answering. If it does not, the fallback
    // semantics differ in better-auth ^1.6.0 and this needs revisiting before
    // anyone relies on it.
    secondaryStorage: {
      get: async (key: string): Promise<string | null> => {
        try {
          return await redis.get(key);
        } catch (error) {
          authLogger.error(
            `secondaryStorage.get failed for "${key}" — treating as cache miss: ${errMsg(error)}`,
          );
          return null;
        }
      },
      set: async (key: string, value: string, ttl?: number): Promise<void> => {
        try {
          if (ttl) await redis.setex(key, ttl, value);
          else await redis.set(key, value);
        } catch (error) {
          authLogger.error(
            `secondaryStorage.set failed for "${key}" — cache write dropped: ${errMsg(error)}`,
          );
        }
      },
      delete: async (key: string): Promise<void> => {
        try {
          await redis.del(key);
        } catch (error) {
          // warn, not error: a failed delete leaves a stale cache entry that
          // expires on its own TTL. It cannot resurrect a revoked session,
          // because revocation also removes the Postgres row.
          authLogger.warn(
            `secondaryStorage.delete failed for "${key}" — stale entry expires via TTL: ${errMsg(error)}`,
          );
        }
      },
    },

    session: {
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    advanced: {
      useSecureCookies: process.env['NODE_ENV'] === 'production',
      cookiePrefix: 'dvantage',
      generateId: () => uuidv7(),
    },

    trustedOrigins: [env.appUrl, wwwAppUrl, 'http://localhost:3000', 'http://localhost:3001'],

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
        await deps.sendPasswordResetEmail(user.email, url);
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      callbackURL: `${env.appUrl}/dashboard`,
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
        await deps.sendVerificationEmail(user.email, url);
      },
    },

    socialProviders: {
      google: {
        clientId: env.googleClientId,
        clientSecret: env.googleClientSecret,
      },
      microsoft: {
        clientId: env.microsoftClientId,
        clientSecret: env.microsoftClientSecret,
      },
    },

    plugins: [twoFactor({ issuer: "D'Vantage" })],

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
