import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { jobDescriptions, type DatabaseClient } from '@vantage/database';
import type { AuthUser } from '../auth/auth.service';
import { DATABASE_CLIENT } from '../database/database.module';
import { SubscriptionService } from '../subscription/subscription.service';
import type { CreateJobDescriptionDto, UpdateJobDescriptionDto } from '@vantage/validation';
import type {
  JobDescriptionListResponseDto,
  JobDescriptionListItemDto,
  JobDescriptionDetailDto,
  DeleteJobDescriptionResponseDto,
} from './dto/job-description-response.dto';

const PAGE_SIZE = 20;

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseClient,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /v1/jobs
  // ---------------------------------------------------------------------------

  async createJob(user: AuthUser, dto: CreateJobDescriptionDto): Promise<JobDescriptionDetailDto> {
    // Entitlement check — throws 402 if free tier limit reached
    await this.subscriptionService.assertCanCreateJob(user.id);

    const id = uuidv7();
    const now = new Date();

    await this.db.insert(jobDescriptions).values({
      id,
      userId: user.id,
      title: dto.title ?? null,
      company: dto.company ?? null,
      content: dto.content,
      url: dto.url ?? null,
      createdAt: now,
      updatedAt: now,
    });

    // Record usage after successful insert
    await this.subscriptionService.recordUsage(user.id, 'job_created');

    this.logger.log(`Job description created — id=${id} user=${user.id}`);

    return {
      id,
      title: dto.title ?? null,
      company: dto.company ?? null,
      url: dto.url ?? null,
      content: dto.content,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // GET /v1/jobs
  // ---------------------------------------------------------------------------

  async listJobs(user: AuthUser, cursor?: string): Promise<JobDescriptionListResponseDto> {
    const cursorDate = cursor ? new Date(cursor) : undefined;

    const rows = await this.db
      .select({
        id: jobDescriptions.id,
        title: jobDescriptions.title,
        company: jobDescriptions.company,
        url: jobDescriptions.url,
        content: jobDescriptions.content,
        createdAt: jobDescriptions.createdAt,
        updatedAt: jobDescriptions.updatedAt,
      })
      .from(jobDescriptions)
      .where(
        and(
          eq(jobDescriptions.userId, user.id),
          cursorDate ? gt(jobDescriptions.createdAt, cursorDate) : undefined,
        ),
      )
      .orderBy(desc(jobDescriptions.createdAt))
      .limit(PAGE_SIZE + 1);

    const hasNextPage = rows.length > PAGE_SIZE;
    const data = rows.slice(0, PAGE_SIZE);

    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobDescriptions)
      .where(eq(jobDescriptions.userId, user.id));

    const total = countRows[0]?.count ?? 0;

    const items: JobDescriptionListItemDto[] = data.map((r) => ({
      id: r.id,
      title: r.title,
      company: r.company,
      url: r.url,
      contentLength: r.content.length,
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
  // GET /v1/jobs/:id
  // ---------------------------------------------------------------------------

  async getJob(user: AuthUser, jobId: string): Promise<JobDescriptionDetailDto> {
    const job = await this.findOwnedJob(user.id, jobId);

    return {
      id: job.id,
      title: job.title,
      company: job.company,
      url: job.url,
      content: job.content,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // PATCH /v1/jobs/:id
  // ---------------------------------------------------------------------------

  async updateJob(
    user: AuthUser,
    jobId: string,
    dto: UpdateJobDescriptionDto,
  ): Promise<JobDescriptionDetailDto> {
    const job = await this.findOwnedJob(user.id, jobId);

    const updatedAt = new Date();

    await this.db
      .update(jobDescriptions)
      .set({
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.company !== undefined ? { company: dto.company } : {}),
        ...(dto.url !== undefined ? { url: dto.url } : {}),
        updatedAt,
      })
      .where(eq(jobDescriptions.id, jobId));

    this.logger.log(`Job description updated — id=${jobId} user=${user.id}`);

    return {
      id: job.id,
      title: dto.title !== undefined ? dto.title : job.title,
      company: dto.company !== undefined ? dto.company : job.company,
      url: dto.url !== undefined ? dto.url : job.url,
      content: job.content,
      createdAt: job.createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // DELETE /v1/jobs/:id
  // ---------------------------------------------------------------------------

  async deleteJob(user: AuthUser, jobId: string): Promise<DeleteJobDescriptionResponseDto> {
    await this.findOwnedJob(user.id, jobId);

    await this.db.delete(jobDescriptions).where(eq(jobDescriptions.id, jobId));

    this.logger.log(`Job description deleted — id=${jobId} user=${user.id}`);

    return { jobDescriptionId: jobId, deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async findOwnedJob(userId: string, jobId: string) {
    const [job] = await this.db
      .select()
      .from(jobDescriptions)
      .where(eq(jobDescriptions.id, jobId))
      .limit(1);

    if (!job) {
      throw new NotFoundException(`Job description "${jobId}" not found.`);
    }

    if (job.userId !== userId) {
      throw new ForbiddenException('You do not have access to this job description.');
    }

    return job;
  }
}
