import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';

import { QUEUE_NAMES, createQueueConnection } from '@vantage/queue';
import { atsScores, jobDescriptions, type DatabaseClient } from '@vantage/database';
import type { ResumeData, OptimizationChange } from '@vantage/validation';
import type { AuthUser } from '../auth/auth.service';
import { DATABASE_CLIENT } from '../database/database.module';
import { SubscriptionService } from '../subscription/subscription.service';
import type { OptimizationStatusDto, OptimizationResultDto } from './dto/optimize-response.dto';

@Injectable()
export class OptimizeService {
  private readonly logger = new Logger(OptimizeService.name);
  private readonly queue: Queue;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseClient,
    private readonly subscriptionService: SubscriptionService,
  ) {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    this.queue = new Queue(QUEUE_NAMES.AI_RESUME_OPTIMIZE, {
      connection: createQueueConnection(redisUrl),
    });
  }

  // ---------------------------------------------------------------------------
  // POST /v1/jobs/:id/scores/:scoreId/optimize
  // ---------------------------------------------------------------------------

  async requestOptimization(
    user: AuthUser,
    jobId: string,
    scoreId: string,
  ): Promise<OptimizationStatusDto> {
    await this.subscriptionService.assertCanOptimize(user.id);

    const scoreRow = await this.findOwnedScore(user.id, jobId, scoreId);

    if (scoreRow.scoringStatus !== 'complete') {
      throw new UnprocessableEntityException(
        `ATS scoring is in status "${scoreRow.scoringStatus}". Optimization requires scoring to be complete.`,
      );
    }

    if (scoreRow.optimizationStatus === 'pending' || scoreRow.optimizationStatus === 'optimizing') {
      throw new UnprocessableEntityException(
        `Optimization is already in progress (status: "${scoreRow.optimizationStatus}").`,
      );
    }

    if (scoreRow.optimizationStatus === 'complete') {
      throw new UnprocessableEntityException(
        'Optimization is already complete. Retrieve the result via GET /v1/jobs/:id/scores/:scoreId/optimize.',
      );
    }

    await this.db
      .update(atsScores)
      .set({ optimizationStatus: 'pending', updatedAt: new Date() })
      .where(eq(atsScores.id, scoreId));

    await this.subscriptionService.recordUsage(user.id, 'optimization');

    await this.queue.add(
      'optimize',
      { atsScoreId: scoreId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    this.logger.log(
      `Optimization job enqueued — atsScoreId=${scoreId} job=${jobId} user=${user.id}`,
    );

    return {
      atsScoreId: scoreId,
      optimizationStatus: 'pending',
      message:
        'Optimization has started. Poll GET /v1/jobs/:id/scores/:scoreId/optimize until status is complete.',
    };
  }

  // ---------------------------------------------------------------------------
  // GET /v1/jobs/:id/scores/:scoreId/optimize
  // ---------------------------------------------------------------------------

  async getOptimization(
    user: AuthUser,
    jobId: string,
    scoreId: string,
  ): Promise<OptimizationResultDto> {
    const scoreRow = await this.findOwnedScore(user.id, jobId, scoreId);

    return {
      atsScoreId: scoreRow.id,
      optimizationStatus: scoreRow.optimizationStatus,
      optimizedData: scoreRow.optimizedStructuredData as ResumeData | null,
      changeLog: scoreRow.optimizationChangeLog as OptimizationChange[] | null,
      optimizationError: scoreRow.optimizationError,
    };
  }

  // ---------------------------------------------------------------------------
  // GET /v1/jobs/:id/scores/:scoreId/optimize/export/pdf
  // GET /v1/jobs/:id/scores/:scoreId/optimize/export/docx
  // ---------------------------------------------------------------------------

  /**
   * Fetch the optimized ResumeData for export.
   * Throws 422 if optimization has not completed or data is absent.
   * Called by the controller before delegating to ResumePdfService / ResumeDocxService.
   */
  async getOptimizedDataForExport(
    user: AuthUser,
    jobId: string,
    scoreId: string,
  ): Promise<{ optimizedData: ResumeData; contactName: string }> {
    const scoreRow = await this.findOwnedScore(user.id, jobId, scoreId);

    if (scoreRow.optimizationStatus !== 'complete' || !scoreRow.optimizedStructuredData) {
      throw new UnprocessableEntityException(
        'Optimization has not completed. Export is available once optimization finishes.',
      );
    }

    const optimizedData = scoreRow.optimizedStructuredData as ResumeData;

    return {
      optimizedData,
      contactName: optimizedData.contact?.name ?? 'resume',
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async findOwnedScore(userId: string, jobId: string, scoreId: string) {
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

    const [scoreRow] = await this.db
      .select()
      .from(atsScores)
      .where(and(eq(atsScores.id, scoreId), eq(atsScores.jobDescriptionId, jobId)))
      .limit(1);

    if (!scoreRow) {
      throw new NotFoundException(`ATS score "${scoreId}" not found.`);
    }

    return scoreRow;
  }
}
