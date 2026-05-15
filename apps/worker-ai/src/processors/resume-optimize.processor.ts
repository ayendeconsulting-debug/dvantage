import { Injectable, Logger } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { createQueueConnection } from '@vantage/queue';
import { atsScores, resumeVersions, jobDescriptions } from '@vantage/database';
import { ResumeOptimizer } from '@vantage/ai';
import type { ResumeData, ATSScore, OptimizationChange } from '@vantage/validation';

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

export interface ResumeOptimizeJobPayload {
  atsScoreId: string;
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

@Injectable()
export class ResumeOptimizeProcessor {
  private readonly logger = new Logger(ResumeOptimizeProcessor.name);

  constructor(private readonly resumeOptimizer: ResumeOptimizer) {}

  /**
   * Process a single resume optimization job.
   *
   * Flow:
   *   1. Load ats_score row → get resume_version_id + job_description_id + score data
   *   2. Guard: optimizationStatus must be 'pending'
   *   3. Load resume_version → structuredData (must exist)
   *   4. Load job_description → content
   *   5. Mark optimizationStatus → 'optimizing'
   *   6. Run ResumeOptimizer.optimize()
   *   7. Write optimizedStructuredData + optimizationChangeLog → status 'complete'
   */
  async process(
    job: Job<ResumeOptimizeJobPayload>,
    db: ReturnType<typeof import('@vantage/database').createDatabaseClient>,
  ): Promise<void> {
    const { atsScoreId } = job.data;

    this.logger.log(`[job:${job.id}] Optimizing resume for ats_score=${atsScoreId}`);

    // 1. Load score row
    const [scoreRow] = await db
      .select()
      .from(atsScores)
      .where(eq(atsScores.id, atsScoreId))
      .limit(1);

    if (!scoreRow) {
      throw new Error(`ResumeOptimizeProcessor: ats_score "${atsScoreId}" not found`);
    }

    // 2. Guard — only process if still pending (idempotency guard)
    if (scoreRow.optimizationStatus !== 'pending') {
      this.logger.warn(
        `[job:${job.id}] ats_score=${atsScoreId} optimizationStatus="${scoreRow.optimizationStatus}" — skipping (not pending)`,
      );
      return;
    }

    // 3. Load resume version
    const [resumeRow] = await db
      .select()
      .from(resumeVersions)
      .where(eq(resumeVersions.id, scoreRow.resumeVersionId))
      .limit(1);

    if (!resumeRow?.structuredData) {
      throw new Error(
        `ResumeOptimizeProcessor: resume_version "${scoreRow.resumeVersionId}" has no structured data`,
      );
    }

    // 4. Load job description
    const [jdRow] = await db
      .select()
      .from(jobDescriptions)
      .where(eq(jobDescriptions.id, scoreRow.jobDescriptionId))
      .limit(1);

    if (!jdRow) {
      throw new Error(
        `ResumeOptimizeProcessor: job_description "${scoreRow.jobDescriptionId}" not found`,
      );
    }

    // Build ATSScore from stored fields (already validated when written by scorer)
    const atsScore: ATSScore = {
      overall:          scoreRow.overallScore ?? 0,
      sections:         scoreRow.sectionScores as ATSScore['sections'],
      keyword_gaps:     (scoreRow.keywordGaps     as string[]) ?? [],
      matched_keywords: (scoreRow.matchedKeywords as string[]) ?? [],
      recommendations:  (scoreRow.recommendations as string[]) ?? [],
    };

    // 5. Mark as optimizing
    await db
      .update(atsScores)
      .set({ optimizationStatus: 'optimizing', updatedAt: new Date() })
      .where(eq(atsScores.id, atsScoreId));

    this.logger.log(
      `[job:${job.id}] Running optimizer — resume=${scoreRow.resumeVersionId} jd=${scoreRow.jobDescriptionId}`,
    );

    // 6. Run optimization
    const { optimizedData, changeLog } = await this.resumeOptimizer.optimize(
      resumeRow.structuredData as ResumeData,
      atsScore,
      jdRow.content,
    );

    this.logger.log(
      `[job:${job.id}] Optimization complete — ${changeLog.length} changes made`,
    );

    // 7. Write results
    await db
      .update(atsScores)
      .set({
        optimizationStatus:      'complete',
        optimizedStructuredData: optimizedData,
        optimizationChangeLog:   changeLog as unknown as OptimizationChange[],
        optimizationError:       null,
        updatedAt:               new Date(),
      })
      .where(eq(atsScores.id, atsScoreId));

    this.logger.log(`[job:${job.id}] ats_score=${atsScoreId} optimization → complete`);
  }

  /**
   * Handle a failed job — mark optimizationStatus as 'failed' so the API
   * can surface the error and allow the user to retry.
   */
  async onFailed(
    job: Job<ResumeOptimizeJobPayload> | undefined,
    error: Error,
    db: ReturnType<typeof import('@vantage/database').createDatabaseClient>,
  ): Promise<void> {
    if (!job) return;
    const { atsScoreId } = job.data;
    this.logger.error(
      `[job:${job.id}] Optimization failed for ats_score=${atsScoreId}: ${error.message}`,
    );
    await db
      .update(atsScores)
      .set({
        optimizationStatus: 'failed',
        optimizationError:  error.message.slice(0, 2000),
        updatedAt:          new Date(),
      })
      .where(eq(atsScores.id, atsScoreId));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createResumeOptimizeWorker(
  processor: ResumeOptimizeProcessor,
  db: ReturnType<typeof import('@vantage/database').createDatabaseClient>,
): Worker {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const connection = createQueueConnection(redisUrl);

  const worker = new Worker<ResumeOptimizeJobPayload>(
    'ai.resume-optimize',
    async (job) => {
      await processor.process(job, db);
    },
    {
      connection,
      concurrency: 1, // optimization is heavy — one at a time per worker instance
    },
  );

  worker.on('failed', async (job, error) => {
    await processor.onFailed(job, error, db);
  });

  return worker;
}
