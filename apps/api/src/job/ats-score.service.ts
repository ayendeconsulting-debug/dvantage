import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { and, desc, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { QUEUE_NAMES, createQueueConnection } from '@vantage/queue';
import {
  atsScores,
  resumeVersions,
  jobDescriptions,
  type DatabaseClient,
} from '@vantage/database';
import type { ATSSectionScores } from '@vantage/validation';
import type { AuthUser } from '../auth/auth.service';
import { DATABASE_CLIENT } from '../database/database.module';
import { SubscriptionService } from '../subscription/subscription.service';
import type {
  AtsScoreListResponseDto,
  AtsScoreListItemDto,
  AtsScoreDetailDto,
  CreateAtsScoreResponseDto,
} from './dto/ats-score-response.dto';

@Injectable()
export class AtsScoreService {
  private readonly logger = new Logger(AtsScoreService.name);
  private readonly queue: Queue;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseClient,
    private readonly subscriptionService: SubscriptionService,
  ) {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    this.queue = new Queue(QUEUE_NAMES.AI_ATS_SCORE, {
      connection: createQueueConnection(redisUrl),
    });
  }

  // ---------------------------------------------------------------------------
  // POST /v1/jobs/:id/scores
  // ---------------------------------------------------------------------------

  async createScore(
    user: AuthUser,
    jobId: string,
    resumeVersionId: string,
  ): Promise<CreateAtsScoreResponseDto> {
    // Entitlement check — throws 402 if free tier limit reached
    await this.subscriptionService.assertCanScore(user.id);

    // Verify the JD belongs to this user
    await this.findOwnedJob(user.id, jobId);

    // Verify the resume version belongs to this user and is fully parsed
    const [resumeRow] = await this.db
      .select({ id: resumeVersions.id, parseStatus: resumeVersions.parseStatus, userId: resumeVersions.userId })
      .from(resumeVersions)
      .where(eq(resumeVersions.id, resumeVersionId))
      .limit(1);

    if (!resumeRow) {
      throw new NotFoundException(`Resume version "${resumeVersionId}" not found.`);
    }

    if (resumeRow.userId !== user.id) {
      throw new ForbiddenException('You do not have access to this resume version.');
    }

    if (resumeRow.parseStatus !== 'complete') {
      throw new UnprocessableEntityException(
        `Resume version is in status "${resumeRow.parseStatus}". Scoring requires a fully parsed resume (status: complete).`,
      );
    }

    // Create the score row
    const atsScoreId = uuidv7();
    const now = new Date();

    await this.db.insert(atsScores).values({
      id:               atsScoreId,
      resumeVersionId,
      jobDescriptionId: jobId,
      scoringStatus:    'pending',
      createdAt:        now,
      updatedAt:        now,
    });

    // Record usage after successful insert — quota is consumed on request, not completion
    await this.subscriptionService.recordUsage(user.id, 'ats_score');

    // Enqueue the scoring job
    await this.queue.add(
      'score',
      { atsScoreId },
      {
        attempts:         3,
        backoff:          { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail:     100,
      },
    );

    this.logger.log(
      `ATS score job enqueued — id=${atsScoreId} resume=${resumeVersionId} jd=${jobId}`,
    );

    return {
      atsScoreId,
      scoringStatus: 'pending',
      message:       'Scoring has started. Poll GET /v1/jobs/:id/scores/:scoreId until status is complete.',
    };
  }

  // ---------------------------------------------------------------------------
  // GET /v1/jobs/:id/scores
  // ---------------------------------------------------------------------------

  async listScores(
    user: AuthUser,
    jobId: string,
  ): Promise<AtsScoreListResponseDto> {
    await this.findOwnedJob(user.id, jobId);

    const rows = await this.db
      .select({
        id:               atsScores.id,
        resumeVersionId:  atsScores.resumeVersionId,
        jobDescriptionId: atsScores.jobDescriptionId,
        scoringStatus:    atsScores.scoringStatus,
        overallScore:     atsScores.overallScore,
        createdAt:        atsScores.createdAt,
        updatedAt:        atsScores.updatedAt,
      })
      .from(atsScores)
      .where(eq(atsScores.jobDescriptionId, jobId))
      .orderBy(desc(atsScores.createdAt));

    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(atsScores)
      .where(eq(atsScores.jobDescriptionId, jobId));

    const total = countRows[0]?.count ?? 0;

    const data: AtsScoreListItemDto[] = rows.map((r) => ({
      id:               r.id,
      resumeVersionId:  r.resumeVersionId,
      jobDescriptionId: r.jobDescriptionId,
      scoringStatus:    r.scoringStatus,
      overallScore:     r.overallScore,
      createdAt:        r.createdAt.toISOString(),
      updatedAt:        r.updatedAt.toISOString(),
    }));

    return { data, total };
  }

  // ---------------------------------------------------------------------------
  // GET /v1/jobs/:id/scores/:scoreId
  // ---------------------------------------------------------------------------

  async getScore(
    user: AuthUser,
    jobId: string,
    scoreId: string,
  ): Promise<AtsScoreDetailDto> {
    await this.findOwnedJob(user.id, jobId);

    const [row] = await this.db
      .select()
      .from(atsScores)
      .where(
        and(
          eq(atsScores.id, scoreId),
          eq(atsScores.jobDescriptionId, jobId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException(`ATS score "${scoreId}" not found.`);
    }

    return {
      id:               row.id,
      resumeVersionId:  row.resumeVersionId,
      jobDescriptionId: row.jobDescriptionId,

      // Original scoring
      scoringStatus:   row.scoringStatus,
      overallScore:    row.overallScore,
      sectionScores:   row.sectionScores as ATSSectionScores | null,
      keywordGaps:     row.keywordGaps as string[] | null,
      matchedKeywords: row.matchedKeywords as string[] | null,
      recommendations: row.recommendations as string[] | null,
      scoreError:      row.scoreError,

      // Optimization
      optimizationStatus: row.optimizationStatus,

      // Post-optimization re-score
      optimizedOverallScore:  row.optimizedOverallScore,
      optimizedSectionScores: row.optimizedSectionScores as ATSSectionScores | null,

      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async findOwnedJob(userId: string, jobId: string) {
    const [job] = await this.db
      .select({ id: jobDescriptions.id, userId: jobDescriptions.userId })
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
