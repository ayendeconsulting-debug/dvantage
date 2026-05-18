// ---------------------------------------------------------------------------
// ExtensionProfileService
//
// Assembles the autofill profile returned by GET /v1/extension/profile and
// persists phone + LinkedIn URL updates via PATCH /v1/extension/profile.
//
// D13 Tier A additions to getProfile():
//   - Renamed skills → topSkills in the response (aligns with UserProfile)
//   - Added resume contact fields: location, github
//   - Added full resume arrays: experience[], education[], certifications[],
//     allSkills[] — these power Tier A deterministic autofill of extended
//     form fields (location, currentTitle, university, degree, etc.) and
//     provide full resume context for Tier B AI fill of custom questions.
//
// Profile assembly (three concurrent DB reads + one conditional R2 presign):
//   users          → name (split into firstName + lastName), email
//   user_profiles  → phone, linkedinUrl (nullable; row may not exist)
//   resume_versions (MRU complete) → full structuredData (ResumeData)
//   StorageService → presignDownload(storageKey) → defaultResumeUrl (1-hour TTL)
//
// No server-side caching — extension caches for 5 minutes in chrome.storage.
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
  ExperienceEntry,
  EducationEntry,
  SkillEntry,
  CertificationEntry,
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

  async getProfile(token: ExtensionToken): Promise<ExtensionProfileResponseDto> {
    const userId = token.userId;

    // ── Concurrent reads ──────────────────────────────────────────────────────
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

    // ── Name split ───────────────────────────────────────────────────────────
    const nameParts = (userRow?.name ?? '').trim().split(/\s+/);
    const firstName = nameParts[0] ?? '';
    const lastName  = nameParts.slice(1).join(' ');

    // ── Resume structured data ───────────────────────────────────────────────
    const resumeData = (resumeRow?.structuredData as ResumeData | null) ?? null;

    // ── Derived convenience fields ───────────────────────────────────────────
    const summary     = resumeData?.summary?.trim() || null;
    const topSkills   = resumeData?.skills ? this.topSkills(resumeData.skills) : [];
    const currentRole = resumeData?.experience?.length
      ? this.resolveCurrentRole(resumeData.experience)
      : null;

    // ── Contact fields (D13 Tier A) ──────────────────────────────────────────
    const location = resumeData?.contact?.location?.trim() || null;
    const github   = resumeData?.contact?.github?.trim()   || null;

    // ── Full resume arrays (D13 Tier A) ──────────────────────────────────────
    const experience:     ExperienceEntry[]     = this.mapExperience(resumeData);
    const education:      EducationEntry[]      = this.mapEducation(resumeData);
    const certifications: CertificationEntry[]  = this.mapCertifications(resumeData);
    const allSkills:      SkillEntry[]          = this.mapAllSkills(resumeData);

    // ── Resume download URL ───────────────────────────────────────────────────
    let defaultResumeUrl: string | null = null;
    if (resumeRow?.storageKey) {
      try {
        const presigned  = await this.storage.presignDownload(resumeRow.storageKey);
        defaultResumeUrl = presigned.downloadUrl;
      } catch (err) {
        this.logger.warn(
          `Profile presignDownload failed — key=${resumeRow.storageKey}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Extension profile assembled — user=${userId} ` +
      `hasPhone=${!!profileRow?.phone} hasLinkedIn=${!!profileRow?.linkedinUrl} ` +
      `hasResume=${!!resumeRow} skills=${topSkills.length} ` +
      `exp=${experience.length} edu=${education.length}`,
    );

    return {
      firstName,
      lastName,
      email:           userRow?.email         ?? '',
      phone:           profileRow?.phone       ?? null,
      linkedinUrl:     profileRow?.linkedinUrl ?? null,
      location,
      github,
      summary,
      topSkills,
      currentRole,
      experience,
      education,
      certifications,
      allSkills,
      defaultResumeId: resumeRow?.id          ?? null,
      defaultResumeUrl,
    };
  }

  // ---------------------------------------------------------------------------
  // PATCH /v1/extension/profile
  // ---------------------------------------------------------------------------

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
  // Private helpers — resume data mapping (D13 Tier A)
  // ---------------------------------------------------------------------------

  private mapExperience(resumeData: ResumeData | null): ExperienceEntry[] {
    if (!resumeData?.experience?.length) return [];
    return resumeData.experience.map((e) => ({
      company:    e.company?.trim()   ?? '',
      title:      e.title?.trim()     ?? '',
      startDate:  e.startDate         ?? '',
      endDate:    e.endDate           ?? null,
      current:    e.current           ?? false,
      highlights: e.highlights        ?? [],
    }));
  }

  private mapEducation(resumeData: ResumeData | null): EducationEntry[] {
    if (!resumeData?.education?.length) return [];
    return resumeData.education.map((e) => ({
      institution: e.institution?.trim() ?? '',
      degree:      e.degree?.trim()      ?? '',
      field:       e.field?.trim()       ?? '',
      startDate:   e.startDate           ?? '',
      endDate:     e.endDate             ?? null,
      gpa:         e.gpa                 ?? null,
    }));
  }

  private mapCertifications(resumeData: ResumeData | null): CertificationEntry[] {
    if (!resumeData?.certifications?.length) return [];
    return resumeData.certifications.map((c) => ({
      name:   c.name?.trim()   ?? '',
      issuer: c.issuer?.trim() ?? '',
      date:   c.date           ?? null,
    }));
  }

  private mapAllSkills(resumeData: ResumeData | null): SkillEntry[] {
    if (!resumeData?.skills?.length) return [];
    return resumeData.skills.map((s) => ({
      name:     s.name     ?? '',
      category: s.category ?? 'technical',
      level:    s.level    ?? null,
    }));
  }

  private topSkills(skills: ResumeData['skills']): string[] {
    return [...skills]
      .sort((a, b) => {
        const ra = LEVEL_RANK[a.level ?? ''] ?? 0;
        const rb = LEVEL_RANK[b.level ?? ''] ?? 0;
        return rb - ra;
      })
      .slice(0, TOP_SKILLS_COUNT)
      .map((s) => s.name);
  }

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
