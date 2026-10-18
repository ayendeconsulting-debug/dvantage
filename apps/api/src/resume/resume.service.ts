import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { QUEUE_NAMES, createQueueConnection } from '@vantage/queue';
import { atsScores, jobDescriptions, resumeVersions, type DatabaseClient } from '@vantage/database';
import type { AuthUser } from '../auth/auth.service';
import { DATABASE_CLIENT } from '../database/database.module';
import { StorageService } from '../storage/storage.service';
import type { UploadUrlRequestDto } from './dto/upload-url-request.dto';
import type {
  UploadUrlResponseDto,
  ResumeVersionListResponseDto,
  ResumeVersionListItemDto,
  ResumeVersionDetailDto,
  ConfirmUploadResponseDto,
  DeleteResumeResponseDto,
} from './dto/resume-version-response.dto';
import type { ResumeOptimizationListDto } from './dto/resume-optimization-response.dto';

const PAGE_SIZE = 20;

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);
  private readonly queue: Queue;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseClient,
    private readonly storage: StorageService,
  ) {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    this.queue = new Queue(QUEUE_NAMES.AI_RESUME_PARSE, {
      connection: createQueueConnection(redisUrl),
    });
  }

  // ---------------------------------------------------------------------------
  // POST /v1/resumes/upload-url  (browser presigned flow)
  // ---------------------------------------------------------------------------

  async createUploadUrl(user: AuthUser, dto: UploadUrlRequestDto): Promise<UploadUrlResponseDto> {
    const { resumeVersionId, storageKey } = await this.createVersionRow(user, dto);

    const { uploadUrl, expiresAt } = await this.storage.presignUpload(storageKey, dto.mimeType);

    this.logger.log(
      `Upload URL issued — user=${user.id} version=${resumeVersionId} file=${dto.filename}`,
    );

    return {
      resumeVersionId,
      uploadUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // POST /v1/resumes/upload  (proxy upload flow — returns storageKey)
  // ---------------------------------------------------------------------------

  async createUploadUrlWithKey(
    user: AuthUser,
    dto: UploadUrlRequestDto,
  ): Promise<{ resumeVersionId: string; storageKey: string }> {
    return this.createVersionRow(user, dto);
  }

  // ---------------------------------------------------------------------------
  // Shared: create the DB row and return IDs
  // ---------------------------------------------------------------------------

  private async createVersionRow(
    user: AuthUser,
    dto: UploadUrlRequestDto,
  ): Promise<{ resumeVersionId: string; storageKey: string }> {
    if (!this.storage.isAllowedMimeType(dto.mimeType)) {
      throw new UnprocessableEntityException(`Unsupported file type "${dto.mimeType}".`);
    }

    if (dto.sizeBytes > this.storage.maxFileSizeBytes) {
      throw new UnprocessableEntityException(
        `File size ${dto.sizeBytes} bytes exceeds the maximum of ${this.storage.maxFileSizeBytes} bytes.`,
      );
    }

    const resumeVersionId = uuidv7();
    const storageKey = this.storage.buildResumeKey(user.id, resumeVersionId, dto.filename);

    const maxVersionRows = await this.db
      .select({ maxVersion: sql<number>`coalesce(max(${resumeVersions.versionNumber}), 0)` })
      .from(resumeVersions)
      .where(and(eq(resumeVersions.userId, user.id), isNull(resumeVersions.deletedAt)));

    const versionNumber = (maxVersionRows[0]?.maxVersion ?? 0) + 1;

    await this.db.insert(resumeVersions).values({
      id: resumeVersionId,
      userId: user.id,
      versionNumber,
      storageKey,
      fileName: dto.filename,
      fileSize: dto.sizeBytes,
      mimeType: dto.mimeType,
      parseStatus: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { resumeVersionId, storageKey };
  }

  // ---------------------------------------------------------------------------
  // POST /v1/resumes/:id/confirm
  // ---------------------------------------------------------------------------

  async confirmUpload(user: AuthUser, resumeVersionId: string): Promise<ConfirmUploadResponseDto> {
    const version = await this.findOwnedVersion(user.id, resumeVersionId);

    if (version.parseStatus !== 'pending') {
      throw new UnprocessableEntityException(
        `Resume version is already in status "${version.parseStatus}". Cannot confirm again.`,
      );
    }

    const exists = await this.storage.objectExists(version.storageKey);
    if (!exists) {
      throw new UnprocessableEntityException(
        'File not found in storage. Please re-upload before confirming.',
      );
    }

    await this.db
      .update(resumeVersions)
      .set({ parseStatus: 'uploaded', updatedAt: new Date() })
      .where(eq(resumeVersions.id, resumeVersionId));

    await this.queue.add(
      'parse',
      {
        resumeVersionId,
        storageKey: version.storageKey,
        mimeType: version.mimeType,
        fileName: version.fileName,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    this.logger.log(`Parse job enqueued — version=${resumeVersionId}`);

    return {
      resumeVersionId,
      parseStatus: 'uploaded',
      message: 'File confirmed. Parsing has started.',
    };
  }

  // ---------------------------------------------------------------------------
  // GET /v1/resumes
  // ---------------------------------------------------------------------------

  async listVersions(user: AuthUser, cursor?: string): Promise<ResumeVersionListResponseDto> {
    const cursorDate = cursor ? new Date(cursor) : undefined;

    const rows = await this.db
      .select({
        id: resumeVersions.id,
        versionNumber: resumeVersions.versionNumber,
        fileName: resumeVersions.fileName,
        fileSize: resumeVersions.fileSize,
        mimeType: resumeVersions.mimeType,
        parseStatus: resumeVersions.parseStatus,
        createdAt: resumeVersions.createdAt,
        updatedAt: resumeVersions.updatedAt,
      })
      .from(resumeVersions)
      .where(
        and(
          eq(resumeVersions.userId, user.id),
          isNull(resumeVersions.deletedAt),
          cursorDate ? gt(resumeVersions.createdAt, cursorDate) : undefined,
        ),
      )
      .orderBy(desc(resumeVersions.createdAt))
      .limit(PAGE_SIZE + 1);

    const hasNextPage = rows.length > PAGE_SIZE;
    const data = rows.slice(0, PAGE_SIZE);

    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(resumeVersions)
      .where(and(eq(resumeVersions.userId, user.id), isNull(resumeVersions.deletedAt)));

    const total = countRows[0]?.count ?? 0;

    const items: ResumeVersionListItemDto[] = data.map((r) => ({
      id: r.id,
      versionNumber: r.versionNumber,
      fileName: r.fileName,
      fileSize: r.fileSize,
      mimeType: r.mimeType,
      parseStatus: r.parseStatus,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    const lastItem = data[data.length - 1];

    return {
      data: items,
      nextCursor: hasNextPage && lastItem ? lastItem.createdAt.toISOString() : null,
      total,
    };
  }

  // ---------------------------------------------------------------------------
  // GET /v1/resumes/:id
  // ---------------------------------------------------------------------------

  async getVersion(user: AuthUser, resumeVersionId: string): Promise<ResumeVersionDetailDto> {
    const version = await this.findOwnedVersion(user.id, resumeVersionId);

    let downloadUrl: string | null = null;
    let downloadUrlExpiresAt: string | null = null;

    if (version.parseStatus === 'complete') {
      const presigned = await this.storage.presignDownload(version.storageKey);
      downloadUrl = presigned.downloadUrl;
      downloadUrlExpiresAt = presigned.expiresAt.toISOString();
    }

    return {
      id: version.id,
      versionNumber: version.versionNumber,
      fileName: version.fileName,
      fileSize: version.fileSize,
      mimeType: version.mimeType,
      parseStatus: version.parseStatus,
      rawText: version.rawText ?? null,
      structuredData: version.structuredData as import('@vantage/validation').ResumeData | null,
      parseError: version.parseError ?? null,
      downloadUrl,
      downloadUrlExpiresAt,
      createdAt: version.createdAt.toISOString(),
      updatedAt: version.updatedAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // DELETE /v1/resumes/:id
  // ---------------------------------------------------------------------------

  async deleteVersion(user: AuthUser, resumeVersionId: string): Promise<DeleteResumeResponseDto> {
    const version = await this.findOwnedVersion(user.id, resumeVersionId);

    await this.db
      .update(resumeVersions)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(resumeVersions.id, resumeVersionId));

    try {
      await this.storage.deleteObject(version.storageKey);
    } catch (err) {
      this.logger.error(
        `Storage delete failed for key "${version.storageKey}": ${(err as Error).message}`,
      );
    }

    this.logger.log(`Resume version deleted — id=${resumeVersionId} user=${user.id}`);

    return { resumeVersionId, deleted: true };
  }

  // ---------------------------------------------------------------------------
  // GET /v1/resumes/:id/export/pdf  |  GET /v1/resumes/:id/export/docx
  // ---------------------------------------------------------------------------

  async getVersionForExport(
    user: AuthUser,
    resumeVersionId: string,
  ): Promise<{ structuredData: import('@vantage/validation').ResumeData; fileName: string }> {
    const version = await this.findOwnedVersion(user.id, resumeVersionId);

    if (version.parseStatus !== 'complete' || !version.structuredData) {
      throw new UnprocessableEntityException(
        'Resume extraction has not completed. Export is available once parsing finishes.',
      );
    }

    return {
      structuredData: version.structuredData as import('@vantage/validation').ResumeData,
      fileName: version.fileName,
    };
  }

  // ---------------------------------------------------------------------------
  // GET /v1/resumes/:id/optimizations
  // ---------------------------------------------------------------------------

  /**
   * Returns every completed optimization that used this resume version,
   * ordered most-recent first.
   *
   * Only jobs owned by the requesting user are included — the JOIN on
   * jobDescriptions.userId enforces this without a separate ownership check.
   * The findOwnedVersion call at the top still verifies the resume itself
   * belongs to the user.
   */
  async listOptimizationsForVersion(
    user: AuthUser,
    resumeVersionId: string,
  ): Promise<ResumeOptimizationListDto> {
    await this.findOwnedVersion(user.id, resumeVersionId);

    const rows = await this.db
      .select({
        atsScoreId: atsScores.id,
        jobId: jobDescriptions.id,
        jobTitle: jobDescriptions.title,
        jobCompany: jobDescriptions.company,
        optimizedAt: atsScores.updatedAt,
      })
      .from(atsScores)
      .innerJoin(jobDescriptions, eq(atsScores.jobDescriptionId, jobDescriptions.id))
      .where(
        and(
          eq(atsScores.resumeVersionId, resumeVersionId),
          eq(atsScores.optimizationStatus, 'complete'),
          eq(jobDescriptions.userId, user.id),
        ),
      )
      .orderBy(desc(atsScores.updatedAt));

    return {
      data: rows.map((r) => ({
        atsScoreId: r.atsScoreId,
        jobId: r.jobId,
        jobTitle: r.jobTitle,
        jobCompany: r.jobCompany,
        optimizedAt: r.optimizedAt.toISOString(),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async findOwnedVersion(userId: string, resumeVersionId: string) {
    const [version] = await this.db
      .select()
      .from(resumeVersions)
      .where(and(eq(resumeVersions.id, resumeVersionId), isNull(resumeVersions.deletedAt)))
      .limit(1);

    if (!version) {
      throw new NotFoundException(`Resume version "${resumeVersionId}" not found.`);
    }

    if (version.userId !== userId) {
      throw new ForbiddenException('You do not have access to this resume version.');
    }

    return version;
  }
}
