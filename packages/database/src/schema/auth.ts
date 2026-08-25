/**
 * Auth schema — Milestone 1
 *
 * Tables consumed by better-auth via the Drizzle adapter. Column names follow
 * the locked convention (snake_case) and are mapped to better-auth's camelCase
 * keys in apps/api/src/auth/auth.config.ts.
 *
 * better-auth table mapping:
 *   "user"         → users
 *   "session"      → sessions
 *   "account"      → accounts
 *   "verification" → verificationTokens
 *   "twoFactor"    → twoFactor
 *
 * ID strategy: text PKs populated by better-auth, configured (M1-C) to emit
 * UUID v7 strings via the `generateId` hook.
 *
 * KMS note: accounts.access_token, accounts.refresh_token, and
 * two_factor.secret are envelope-encrypted by AWS KMS before storage (M1-C).
 * Raw values are NEVER persisted unencrypted.
 */

import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),

    emailVerified: boolean('email_verified').notNull().default(false),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),

    // OAuth avatar URL — populated by Google / Microsoft on first sign-in
    image: text('image'),

    // Soft delete — hard delete only by compliance / GDPR request
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  verificationTokens: many(verificationTokens),
  twoFactor: many(twoFactor),
}));

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

/**
 * Postgres is the source of truth for session audit.
 * Redis provides fast O(1) lookup — the `token` is the Redis key.
 * better-auth handles expiry sliding; sessions.expires_at mirrors Redis TTL.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Captured for security audit — never used for auth decisions
    ipAddress: varchar('ip_address', { length: 45 }), // supports IPv4 + IPv6
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenIdx: uniqueIndex('sessions_token_idx').on(t.token),
    userIdx: index('sessions_user_id_idx').on(t.userId),
    expiresIdx: index('sessions_expires_at_idx').on(t.expiresAt),
  }),
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

/**
 * One row per provider per user.
 *   providerId: "credential" | "google" | "microsoft"
 *
 * For "credential" rows: password is bcrypt hash; OAuth token fields are null.
 * For OAuth rows: password is null; access_token / refresh_token are KMS-encrypted.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(), // provider's external user ID
    providerId: varchar('provider_id', { length: 64 }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // KMS-encrypted (M1-C) — null for email/password accounts
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),

    // bcrypt hash — null for OAuth accounts
    password: text('password'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('accounts_user_id_idx').on(t.userId),
    providerIdx: index('accounts_provider_id_idx').on(t.providerId),
    // One account per provider per external ID — prevents duplicate OAuth links
    providerUserIdx: uniqueIndex('accounts_provider_user_idx').on(t.providerId, t.accountId),
  }),
);

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

// ---------------------------------------------------------------------------
// verification_tokens
// ---------------------------------------------------------------------------

/**
 * Stores hashed tokens for email verification and password reset flows.
 * `identifier` is the email address being verified.
 * Expired tokens are pruned by a scheduled job (worker-scheduler, M5).
 */
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: text('id').primaryKey(),
    identifier: varchar('identifier', { length: 255 }).notNull(), // email
    value: text('value').notNull(), // hashed token
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    identifierIdx: index('verification_tokens_identifier_idx').on(t.identifier),
    expiresIdx: index('verification_tokens_expires_at_idx').on(t.expiresAt),
  }),
);

// ---------------------------------------------------------------------------
// two_factor
// ---------------------------------------------------------------------------

/**
 * One row per user — created when user enables TOTP MFA.
 * secret: KMS-encrypted TOTP seed (M1-C).
 * backup_codes: JSON array of bcrypt-hashed one-time codes.
 */
export const twoFactor = pgTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(), // KMS-encrypted TOTP secret
    backupCodes: text('backup_codes').notNull(), // JSON array of hashed backup codes
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One TOTP config per user
    userIdx: uniqueIndex('two_factor_user_id_idx').on(t.userId),
  }),
);

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(users, { fields: [twoFactor.userId], references: [users.id] }),
}));
