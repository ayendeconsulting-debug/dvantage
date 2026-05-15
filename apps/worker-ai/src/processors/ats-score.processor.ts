import { Injectable, Logger } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { createQueueConnection } from '@vantage/queue';
import { atsScores, resumeVersions, jobDescriptions } from '@vantage/database';
import { AtsScorer } from '@vantage/ai';
import type { ResumeData } from '@vantage/validation';

// ---------------------------------------------------------------------------
// Job payload — atsScoreId is the single source of truth.
// All related data (resume, JD) is loaded inside the processor via DB joins.
// ---------------------------------------------------------------------------

export interface AtsScoreJobPayload {
  atsScoreId: string;
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

@Injectable()
export class AtsScoreProcessor {
  private readonly logger = new Logger(AtsScoreProcessor.name);

  constructor(private readonly atsScorer: AtsScorer) {}

  /**
   * Process a single ATS scoring job.
   *
   * Flow:
   *   1. Load ats_score row → get resume_version_id + job_description_id
   *   2. Load resume_version → get structured_data (must be complete)
   *   3. Load job_description → get content
   *   4. Mark status → scoring
   *   5. Run two-step AtsScorer.score()
   *   6. Write ATSScore results → status complete
   */
  async process(
    job: Job<AtsScoreJobPayload>,
    db: ReturnType<typeof import('@vantage/database').createDatabaseClient>,
  ): Promise<void> {
    const { atsScoreId } = job.data;

    this.logger.log(`[job:${job.id}] Scoring ats_score=${atsScoreId}`);

    // 1. Load the score row
    const [scoreRow] = await db
      .select()
      .from(atsScores)
      .where(eq(atsScores.id, atsScoreId))
      .limit(1);

    if (!scoreRow) {
      throw new Error(`AtsScoreProcessor: ats_score "${atsScoreId}" not found`);
    }

    // 2. Load resume version — must have structured data
    const [resumeRow] = await db
      .select()
      .from(resumeVersions)
      .where(eq(resumeVersions.id, scoreRow.resumeVersionId))
      .limit(1);

    if (!resumeRow) {
      throw new Error(
        `AtsScoreProcessor: resume_version "${scoreRow.resumeVersionId}" not found`,
      );
    }

    if (!resumeRow.structuredData) {
      throw new Error(
        `AtsScoreProcessor: resume_version "${scoreRow.resumeVersionId}" has no structured data — parse must be complete before scoring`,
      );
    }

    // 3. Load job description
    const [jdRow] = await db
      .select()
      .from(jobDescriptions)
      .where(eq(jobDescriptions.id, scoreRow.jobDescriptionId))
      .limit(1);

    if (!jdRow) {
      throw new Error(
        `AtsScoreProcessor: job_description "${scoreRow.jobDescriptionId}" not found`,
      );
    }

    // 4. Mark as scoring
    await db
      .update(atsScores)
      .set({ scoringStatus: 'scoring', updatedAt: new Date() })
      .where(eq(atsScores.id, atsScoreId));

    this.logger.log(
      `[job:${job.id}] Running two-step ATS score — resume=${scoreRow.resumeVersionId} jd=${scoreRow.jobDescriptionId}`,
    );

    // 5. Run two-step scoring
    const atsScore = await this.atsScorer.score(
      resumeRow.structuredData as ResumeData,
      jdRow.content,
    );

    this.logger.log(`[job:${job.id}] Scoring complete — overall=${atsScore.overall}`);

    // 6. Write results
    await db
      .update(atsScores)
      .set({
        scoringStatus:    'complete',
        overallScore:     atsScore.overall,
        sectionScores:    atsScore.sections,
        keywordGaps:      atsScore.keyword_gaps,
        matchedKeywords:  atsScore.matched_keywords,
        recommendations:  atsScore.recommendations,
        scoreError:       null,
        updatedAt:        new Date(),
      })
      .where(eq(atsScores.id, atsScoreId));

    this.logger.log(`[job:${job.id}] ats_score=${atsScoreId} → complete`);
  }

  /**
   * Handle a failed job — write error to DB so the API can surface it.
   */
  async onFailed(
    job: Job<AtsScoreJobPayload> | undefined,
    error: Error,
    db: ReturnType<typeof import('@vantage/database').createDatabaseClient>,
  ): Promise<void> {
    if (!job) return;
    const { atsScoreId } = job.data;
    this.logger.error(
      `[job:${job.id}] Failed for ats_score=${atsScoreId}: ${error.message}`,
    );
    await db
      .update(atsScores)
      .set({
        scoringStatus: 'failed',
        scoreError:    error.message.slice(0, 2000),
        updatedAt:     new Date(),
      })
      .where(eq(atsScores.id, atsScoreId));
  }
}

// ---------------------------------------------------------------------------
// Factory — creates and starts the BullMQ Worker
// ---------------------------------------------------------------------------

export function createAtsScoreWorker(
  processor: AtsScoreProcessor,
  db: ReturnType<typeof import('@vantage/database').createDatabaseClient>,
): Worker {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const connection = createQueueConnection(redisUrl);

  const worker = new Worker<AtsScoreJobPayload>(
    'ai.ats-score',
    async (job) => {
      await processor.process(job, db);
    },
    {
      connection,
      concurrency: 2, // ATS scoring is two AI calls — keep concurrency lower
    },
  );

  worker.on('failed', async (job, error) => {
    await processor.onFailed(job, error, db);
  });

  return worker;
}
