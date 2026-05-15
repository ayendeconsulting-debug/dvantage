import { Injectable, Logger } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { createQueueConnection } from '@vantage/queue';
import { resumeVersions } from '@vantage/database';
import { ParsingService } from '@vantage/parsing';
import { ResumeExtractor } from '@vantage/ai';
import {
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Job payload — must match what ResumeService enqueues in M2-D
// ---------------------------------------------------------------------------

export interface ResumeParseJobPayload {
  resumeVersionId: string;
  storageKey: string;
  mimeType: string;
  fileName: string;
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

@Injectable()
export class ResumeParseProcessor {
  private readonly logger = new Logger(ResumeParseProcessor.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly parsingService: ParsingService,
    private readonly resumeExtractor: ResumeExtractor,
  ) {
    const endpoint        = this.requireEnv('R2_ENDPOINT');
    const accessKeyId     = this.requireEnv('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.requireEnv('R2_SECRET_ACCESS_KEY');
    const region          = process.env['R2_REGION'] ?? 'auto';
    const forcePathStyle  = process.env['R2_FORCE_PATH_STYLE'] === 'true';
    this.bucket           = this.requireEnv('R2_BUCKET_RESUMES');

    this.s3 = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
    });
  }

  private requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) throw new Error(`ResumeParseProcessor: missing env var "${key}"`);
    return value;
  }

  /**
   * Process a single resume parse job.
   * Called by the BullMQ Worker registered in WorkerAiModule.
   */
  async process(job: Job<ResumeParseJobPayload>, db: ReturnType<typeof import('@vantage/database').createDatabaseClient>): Promise<void> {
    const { resumeVersionId, storageKey, mimeType, fileName } = job.data;

    this.logger.log(`[job:${job.id}] Processing resume ${resumeVersionId}`);

    // 1. Mark as parsing
    await db
      .update(resumeVersions)
      .set({ parseStatus: 'parsing', updatedAt: new Date() })
      .where(eq(resumeVersions.id, resumeVersionId));

    // 2. Download from object storage
    const getResult = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );

    if (!getResult.Body) {
      throw new Error(`Storage object "${storageKey}" has no body`);
    }

    // Collect stream into Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of getResult.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    this.logger.log(`[job:${job.id}] Downloaded ${buffer.byteLength} bytes`);

    // 3. Parse raw text
    const { rawText, wordCount, pageCount } = await this.parsingService.parse(
      buffer,
      mimeType,
      fileName,
    );

    this.logger.log(
      `[job:${job.id}] Parsed — words=${wordCount}` +
        (pageCount !== undefined ? ` pages=${pageCount}` : ''),
    );

    // 4. AI structured extraction
    const structuredData = await this.resumeExtractor.extract(rawText);

    this.logger.log(`[job:${job.id}] Extraction complete`);

    // 5. Write results — status complete
    await db
      .update(resumeVersions)
      .set({
        rawText,
        structuredData,
        parseStatus: 'complete',
        parseError: null,
        updatedAt: new Date(),
      })
      .where(eq(resumeVersions.id, resumeVersionId));

    this.logger.log(`[job:${job.id}] Resume ${resumeVersionId} → complete`);
  }

  /**
   * Handle a failed job — write error to DB so the API can surface it.
   */
  async onFailed(
    job: Job<ResumeParseJobPayload> | undefined,
    error: Error,
    db: ReturnType<typeof import('@vantage/database').createDatabaseClient>,
  ): Promise<void> {
    if (!job) return;
    const { resumeVersionId } = job.data;
    this.logger.error(
      `[job:${job.id}] Failed for resume ${resumeVersionId}: ${error.message}`,
    );
    await db
      .update(resumeVersions)
      .set({
        parseStatus: 'failed',
        parseError: error.message.slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(resumeVersions.id, resumeVersionId));
  }
}

// ---------------------------------------------------------------------------
// Factory — creates and starts the BullMQ Worker
// ---------------------------------------------------------------------------

export function createResumeParseWorker(
  processor: ResumeParseProcessor,
  db: ReturnType<typeof import('@vantage/database').createDatabaseClient>,
): Worker {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const connection = createQueueConnection(redisUrl);

  const worker = new Worker<ResumeParseJobPayload>(
    'ai.resume-parse',
    async (job) => {
      await processor.process(job, db);
    },
    {
      connection,
      concurrency: 3,
      // attempts + backoff are set on the job producer (ResumeService), not the worker
    },
  );

  worker.on('failed', async (job, error) => {
    await processor.onFailed(job, error, db);
  });

  return worker;
}
