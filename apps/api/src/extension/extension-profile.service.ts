// ---------------------------------------------------------------------------
// ExtensionProfileService
//
// Assembles the autofill profile returned by GET /v1/extension/profile and
// persists phone + LinkedIn URL updates via PATCH /v1/extension/profile.
//
// Profile assembly (three concurrent DB reads + one conditional R2 presign):
//   users          → name (split into firstName + lastName), email
//   user_profiles  → phone, linkedinUrl           (nullable; row may not exist)
//   resume_versions (MRU complete) → structuredData → summary, skills, currentRole
//   StorageService → presignDownload(storageKey)  → defaultResumeUrl (1-hour TTL)
//
// Skill ranking: expert(4) > advanced(3) > intermediate(2) > beginner(1).
// Top 5 returned to keep autofill payload small.
//
// currentRole resolution:
//   1. First experience entry where current === true.
//   2. experience[0] (resumes list most-recent first by convention).
//   Format: "<title> @ <company>"
//
// No caching server-side — the extension caches this response for 5 minutes
// in chrome.storage.local[CACHED_PROFILE] via the background service worker.
// ---------------------------------------------------------------------------

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, isNull }      from 'drizzle-orm';
import { uuidv7 }                     from 'uuidv7';

import {
  resumeVersions,
  userProfiles,
  users,
  type DatabaseClient,
  type ExtensionToken,
} from '@vantage/database';
import type { ResumeData } from '@vantage/validation';

import { DATABASE_CLIENT } from '../database/database.module';
import { StorageService }  from '../storage/storage.service';
import type {
  ExtensionProfileResponseDto,
  ExtensionProfileUpdateDto,
} from './dto/extension-profile.dto';

// ---------------------------------------------------------------------------
// Skill level ranking — higher number = higher rank
// ---------------------------------------------------------------------------

const LEVEL_RANK: Readonly<Record<string, number>> = {
  expert:       4,
  advanced:     3,
  intermediate: 2,
  beginner:     1,
};

const TOP_SKILLS_COUNT = 5;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ExtensionProfileService {
  private readonly logger = new Logger(ExtensionProfileService.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseClient,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------------------
  // GET /v1/extension/profile
  // ---------------------------------------------------------------------------

  /**
   * Assemble the autofill profile for the authenticated user.
   *
   * Three DB reads run concurrently via Promise.all.
   * The R2 presign (fourth async step) runs sequentially only if a resume exists —
   * it generates a signed URL without touching R2 over the wire (SDK-only).
   */
  async getProfile(token: ExtensionToken): Promise<ExtensionProfileResponseDto> {
    const userId = token.userId;

    // ── Concurrent reads ──────────────────────────────────────────────────
    const [userRow, profileRow, resumeRow] = await Promise.all([
      this.db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),

      this.db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),

      // MRU complete resume version — most-recently created, not most-recently updated,
      // so re-parses of the same file don't re-order versions.
      this.db
        .select()
        .from(resumeVersions)
        .where(
          and(
            eq(resumeVersions.userId,      userId),
            eq(resumeVersions.parseStatus, 'complete'),
            isNull(resumeVersions.deletedAt),
          ),
        )
        .orderBy(desc(resumeVersions.createdAt))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);

    // ── Name split ────────────────────────────────────────────────────────
    // better-auth stores a single `name` string. We split on the first whitespace
    // boundary so adapters can fill separate firstName / lastName fields without
    // duplicating the split logic in every adapter or panel component.
    const nameParts = (userRow?.name ?? '').trim().split(/\s+/);
    const firstName = nameParts[0] ?? '';
    const lastName  = nameParts.slice(1).join(' ');

    // ── Resume structured data ────────────────────────────────────────────
    const resumeData = (resumeRow?.structuredData as ResumeData | null) ?? null;

    const summary     = resumeData?.summary?.trim() || null;
    const skills      = resumeData?.skills ? this.topSkills(resumeData.skills) : [];
    const currentRole = resumeData?.experience?.length
      ? this.resolveCurrentRole(resumeData.experience)
      : null;

    // ── Resume download URL ───────────────────────────────────────────────
    let defaultResumeUrl: string | null = null;
    if (resumeRow?.storageKey) {
      try {
        const presigned  = await this.storage.presignDownload(resumeRow.storageKey);
        defaultResumeUrl = presigned.downloadUrl;
      } catch (err) {
        // Non-fatal — the extension can still autofill text fields without the resume URL.
        this.logger.warn(
          `Profile presignDownload failed — key=${resumeRow.storageKey}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Extension profile assembled — user=${userId} ` +
      `hasPhone=${!!profileRow?.phone} hasLinkedIn=${!!profileRow?.linkedinUrl} ` +
      `hasResume=${!!resumeRow} skills=${skills.length}`,
    );

    return {
      firstName,
      lastName,
      email:           userRow?.email   ?? '',
      phone:           profileRow?.phone       ?? null,
      linkedinUrl:     profileRow?.linkedinUrl ?? null,
      summary,
      skills,
      currentRole,
      defaultResumeId: resumeRow?.id        ?? null,
      defaultResumeUrl,
    };
  }

  // ---------------------------------------------------------------------------
  // PATCH /v1/extension/profile
  // ---------------------------------------------------------------------------

  /**
   * Upsert the user_profiles row for this user.
   *
   * Only fields present in the DTO are written — undefined means "leave as-is".
   * Returns the full assembled profile after update so the extension replaces
   * its chrome.storage.local[CACHED_PROFILE] without a separate GET.
   *
   * Upsert strategy: check for existing row, then INSERT or UPDATE.
   * Using a conditional branch rather than ON CONFLICT because Drizzle's
   * onConflictDoUpdate requires the conflict target to be a unique index,
   * and the `.unique()` on userId creates an unnamed constraint — safe to
   * use here but fragile across Drizzle versions. Explicit SELECT→INSERT/UPDATE
   * is more readable and equally performant for a single-row-per-user table.
   */
  async updateProfile(
    token: ExtensionToken,
    dto:   ExtensionProfileUpdateDto,
  ): Promise<ExtensionProfileResponseDto> {
    const userId = token.userId;
    const now    = new Date();

    const existing = await this.db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (existing) {
      const updateSet: Record<string, unknown> = { updatedAt: now };
      if (dto.phone       !== undefined) updateSet['phone']       = dto.phone;
      if (dto.linkedinUrl !== undefined) updateSet['linkedinUrl'] = dto.linkedinUrl;

      await this.db
        .update(userProfiles)
        .set(updateSet)
        .where(eq(userProfiles.userId, userId));
    } else {
      await this.db.insert(userProfiles).values({
        id:          uuidv7(),
        userId,
        phone:       dto.phone       ?? null,
        linkedinUrl: dto.linkedinUrl ?? null,
        createdAt:   now,
        updatedAt:   now,
      });
    }

    this.logger.log(
      `Extension profile updated — user=${userId} ` +
      `phone=${dto.phone !== undefined ? 'set' : 'unchanged'} ` +
      `linkedin=${dto.linkedinUrl !== undefined ? 'set' : 'unchanged'}`,
    );

    return this.getProfile(token);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Return the top N skill names ordered by level descending.
   * Within the same level, the resume's original ordering is preserved
   * (stable sort behaviour via [...spread]).
   */
  private topSkills(skills: ResumeData['skills']): string[] {
    return [...skills]
      .sort((a, b) => {
        const ra = LEVEL_RANK[a.level ?? ''] ?? 0;
        const rb = LEVEL_RANK[b.level ?? ''] ?? 0;
        return rb - ra; // descending
      })
      .slice(0, TOP_SKILLS_COUNT)
      .map((s) => s.name);
  }

  /**
   * Resolve the current or most-recent role as a single display string.
   *
   * Resolution order:
   *   1. First experience entry with current === true.
   *   2. experience[0] — resume convention: most-recent entry listed first.
   *
   * Format: "<title> @ <company>"
   * Handles partial data gracefully — returns just title or just company
   * if one is empty, or null if both are.
   */
  private resolveCurrentRole(experience: ResumeData['experience']): string | null {
    const entry = experience.find((e) => e.current) ?? experience[0];
    if (!entry) return null;

    const title   = entry.title?.trim()   ?? '';
    const company = entry.company?.trim() ?? '';

    if (!title && !company) return null;
    if (!company)           return title;
    if (!title)             return company;
    return `${title} @ ${company}`;
  }
}
