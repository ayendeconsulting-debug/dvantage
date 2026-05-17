// ---------------------------------------------------------------------------
// ExtensionAuthService
//
// Owns the full lifecycle of extension bearer tokens:
//   exchange         → mint (called once per install from BG SW after /extension/done)
//   refresh          → slide last_seen_at + return new expiresAt (called by BG SW)
//   revoke           → soft-delete one token (called on extension sign-out)
//   revokeAllForUser → soft-delete all active tokens (called on web app sign-out)
//   validate         → hash lookup (called by ExtensionAuthGuard on every request)
//   getProfile       → user identity + plan (called by GET /profile, cached in extension)
//
// Token hashing: SHA-256 via Node.js built-in `node:crypto`.
// Rationale: tokens are 32 bytes of CSPRNG output (256 bits of entropy),
// so bcrypt's brute-force resistance is unnecessary. SHA-256 is deterministic,
// enabling a single O(1) indexed DB lookup. (bcrypt would require loading all
// user tokens and calling compare() in a serial loop.)
// ---------------------------------------------------------------------------

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, isNull }                               from 'drizzle-orm';
import { createHash, randomBytes }                       from 'node:crypto';
import { uuidv7 }                                        from 'uuidv7';

import {
  extensionTokens,
  users,
  subscriptions,
  type DatabaseClient,
  type ExtensionToken,
} from '@vantage/database';
import type { AuthUser }    from '../auth/auth.service';
import { DATABASE_CLIENT }  from '../database/database.module';
import type {
  ExchangeResponseDto,
  RefreshResponseDto,
  UserProfileDto,
}                           from './dto/extension-auth-response.dto';

/** 30-day sliding window in milliseconds. Matches TOKEN_LIFETIME_MS in the extension. */
const TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class ExtensionAuthService {
  private readonly logger = new Logger(ExtensionAuthService.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseClient,
  ) {}

  // ---------------------------------------------------------------------------
  // exchange — mint a new token
  // ---------------------------------------------------------------------------

  async exchange(user: AuthUser, userAgent?: string): Promise<ExchangeResponseDto> {
    const rawToken  = randomBytes(32).toString('hex'); // 64-char hex, 256 bits entropy
    const tokenHash = this.sha256(rawToken);
    const id        = uuidv7();
    const now       = new Date();

    await this.db.insert(extensionTokens).values({
      id,
      userId:     user.id,
      tokenHash,
      lastSeenAt: now,
      userAgent:  userAgent ?? null,
      createdAt:  now,
    });

    this.logger.log(`Extension token minted — user=${user.id} tokenId=${id}`);

    const expiresAt = new Date(now.getTime() + TOKEN_LIFETIME_MS);
    return {
      token:     rawToken,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // refresh — slide last_seen_at + return new expiresAt
  //
  // The server is the authoritative clock for token expiry. Returns the new
  // expiresAt so the extension can update chrome.storage.local without
  // computing the window independently (which would create two sources of truth).
  // ---------------------------------------------------------------------------

  async refresh(token: ExtensionToken): Promise<RefreshResponseDto> {
    const now = new Date();

    await this.db
      .update(extensionTokens)
      .set({ lastSeenAt: now })
      .where(eq(extensionTokens.id, token.id));

    this.logger.log(`Extension token refreshed — tokenId=${token.id} user=${token.userId}`);

    const expiresAt = new Date(now.getTime() + TOKEN_LIFETIME_MS);
    return { expiresAt: expiresAt.toISOString() };
  }

  // ---------------------------------------------------------------------------
  // revoke — soft-delete one token (called on extension sign-out)
  // ---------------------------------------------------------------------------

  async revoke(token: ExtensionToken): Promise<void> {
    await this.db
      .update(extensionTokens)
      .set({ revokedAt: new Date() })
      .where(eq(extensionTokens.id, token.id));

    this.logger.log(`Extension token revoked — tokenId=${token.id} user=${token.userId}`);
  }

  // ---------------------------------------------------------------------------
  // revokeAllForUser — soft-delete all active tokens for a user
  //
  // Called when the user signs out of the web app. Ensures any connected
  // extension installations are immediately invalidated across all devices.
  // Only active tokens (revokedAt IS NULL) are updated — idempotent.
  // ---------------------------------------------------------------------------

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(extensionTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(extensionTokens.userId, userId),
          isNull(extensionTokens.revokedAt),
        ),
      );

    this.logger.log(`All active extension tokens revoked — userId=${userId}`);
  }

  // ---------------------------------------------------------------------------
  // validate — used by ExtensionAuthGuard on every protected request
  // ---------------------------------------------------------------------------

  async validate(rawToken: string): Promise<ExtensionToken | null> {
    const tokenHash = this.sha256(rawToken);

    const [row] = await this.db
      .select()
      .from(extensionTokens)
      .where(
        and(
          eq(extensionTokens.tokenHash, tokenHash),
          isNull(extensionTokens.revokedAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  // ---------------------------------------------------------------------------
  // getProfile — user identity + subscription plan
  //
  // Joins users → subscriptions (left join — free users have no subscription row).
  // Defaults plan to 'free' when no subscription row exists.
  // Called by GET /v1/extension/auth/profile on every side-panel open.
  // The extension caches the result in chrome.storage.local[USER_PROFILE]
  // and revalidates in the background (stale-while-revalidate).
  // ---------------------------------------------------------------------------

  async getProfile(token: ExtensionToken): Promise<UserProfileDto> {
    const [row] = await this.db
      .select({
        name:  users.name,
        email: users.email,
        plan:  subscriptions.plan,
      })
      .from(users)
      .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
      .where(eq(users.id, token.userId))
      .limit(1);

    if (!row) {
      // Should never occur — ExtensionAuthGuard validates the token FK exists.
      throw new NotFoundException(`User not found for tokenId=${token.id}`);
    }

    return {
      name:  row.name,
      email: row.email,
      // Left join: plan is null when no subscription row exists → default free.
      plan:  row.plan ?? 'free',
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
