// ---------------------------------------------------------------------------
// ExtensionAuthService
//
// Owns the full lifecycle of extension bearer tokens:
//   exchange  → mint (called once per install from web app /extension/auth page)
//   refresh   → slide last_seen_at (called by background SW periodically)
//   revoke    → soft-delete (called on sign-out or from /settings/devices)
//   validate  → hash lookup (called by ExtensionAuthGuard on every request)
//
// Token hashing: SHA-256 via Node.js built-in `node:crypto`.
// Rationale: tokens are 32 bytes of CSPRNG output (256 bits of entropy),
// so bcrypt's brute-force resistance is unnecessary. SHA-256 is deterministic,
// enabling a single O(1) indexed DB lookup. (bcrypt would require loading all
// user tokens and calling compare() in a serial loop.)
// ---------------------------------------------------------------------------

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull }            from 'drizzle-orm';
import { createHash, randomBytes }    from 'node:crypto';
import { uuidv7 }                     from 'uuidv7';

import { extensionTokens, type DatabaseClient, type ExtensionToken } from '@vantage/database';
import type { AuthUser }              from '../auth/auth.service';
import { DATABASE_CLIENT }            from '../database/database.module';
import type { ExchangeResponseDto }   from './dto/extension-auth-response.dto';

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
  // refresh — slide last_seen_at (extends the 30-day window)
  // ---------------------------------------------------------------------------

  async refresh(token: ExtensionToken): Promise<void> {
    await this.db
      .update(extensionTokens)
      .set({ lastSeenAt: new Date() })
      .where(eq(extensionTokens.id, token.id));
  }

  // ---------------------------------------------------------------------------
  // revoke — soft-delete (immediate, per-device)
  // ---------------------------------------------------------------------------

  async revoke(token: ExtensionToken): Promise<void> {
    await this.db
      .update(extensionTokens)
      .set({ revokedAt: new Date() })
      .where(eq(extensionTokens.id, token.id));

    this.logger.log(`Extension token revoked — tokenId=${token.id} user=${token.userId}`);
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
  // Private helpers
  // ---------------------------------------------------------------------------

  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
