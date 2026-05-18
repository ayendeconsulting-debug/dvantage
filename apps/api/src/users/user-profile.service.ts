// ---------------------------------------------------------------------------
// UserProfileService
//
// Reads and writes the user_profiles row for the authenticated web app user.
// Mirrors the upsert logic in ExtensionProfileService but accepts AuthUser
// (session-based) rather than ExtensionToken (Bearer-based).
//
// Endpoints served:
//   GET  /v1/users/me/profile → phone + linkedinUrl (null when not set)
//   PATCH /v1/users/me/profile → upsert phone and/or linkedinUrl
//
// Design decisions:
//   - SELECT → INSERT/UPDATE upsert pattern (same as ExtensionProfileService)
//     rather than onConflictDoUpdate — see ExtensionProfileService for rationale.
//   - Only phone and linkedinUrl are editable here (MVP). Name/email are owned
//     by better-auth and must be changed via the auth flow.
//   - No cache server-side — the browser form re-fetches on mount.
// ---------------------------------------------------------------------------

import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq }                          from 'drizzle-orm';
import { uuidv7 }                      from 'uuidv7';

import {
  userProfiles,
  type DatabaseClient,
} from '@vantage/database';

import { DATABASE_CLIENT }      from '../database/database.module';
import type { AuthUser }        from '../auth/auth.service';
import type {
  UpdateUserProfileDto,
  UserProfileResponseDto,
} from './dto/user-profile.dto';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseClient,
  ) {}

  // ---------------------------------------------------------------------------
  // GET /v1/users/me/profile
  // ---------------------------------------------------------------------------

  /**
   * Return the current phone and linkedinUrl for the authenticated user.
   * Returns nulls when the user_profiles row does not yet exist.
   */
  async getProfile(user: AuthUser): Promise<UserProfileResponseDto> {
    const row = await this.db
      .select({
        phone:       userProfiles.phone,
        linkedinUrl: userProfiles.linkedinUrl,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    return {
      phone:       row?.phone       ?? null,
      linkedinUrl: row?.linkedinUrl ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // PATCH /v1/users/me/profile
  // ---------------------------------------------------------------------------

  /**
   * Upsert phone and/or linkedinUrl for the authenticated user.
   * Fields not present in the DTO are left unchanged.
   * Returns the full profile after the update.
   */
  async updateProfile(
    user: AuthUser,
    dto:  UpdateUserProfileDto,
  ): Promise<UserProfileResponseDto> {
    const now = new Date();

    const existing = await this.db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (existing) {
      const updateSet: Record<string, unknown> = { updatedAt: now };
      if (dto.phone       !== undefined) updateSet['phone']       = dto.phone;
      if (dto.linkedinUrl !== undefined) updateSet['linkedinUrl'] = dto.linkedinUrl;

      await this.db
        .update(userProfiles)
        .set(updateSet)
        .where(eq(userProfiles.userId, user.id));
    } else {
      await this.db.insert(userProfiles).values({
        id:          uuidv7(),
        userId:      user.id,
        phone:       dto.phone       ?? null,
        linkedinUrl: dto.linkedinUrl ?? null,
        createdAt:   now,
        updatedAt:   now,
      });
    }

    this.logger.log(
      `User profile updated — userId=${user.id} ` +
      `phone=${dto.phone !== undefined ? 'set' : 'unchanged'} ` +
      `linkedin=${dto.linkedinUrl !== undefined ? 'set' : 'unchanged'}`,
    );

    return this.getProfile(user);
  }
}
