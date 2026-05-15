import { Module, type OnApplicationShutdown, Logger } from '@nestjs/common';
import { ParsingModule } from '@vantage/parsing';
import { ResumeExtractor, AtsScorer, ResumeOptimizer } from '@vantage/ai';
import { createDatabaseClient } from '@vantage/database';
import { ResumeParseProcessor, createResumeParseWorker }     from './processors/resume-parse.processor';
import { AtsScoreProcessor, createAtsScoreWorker }           from './processors/ats-score.processor';
import { ResumeOptimizeProcessor, createResumeOptimizeWorker } from './processors/resume-optimize.processor';
import type { Worker } from 'bullmq';

const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

@Module({
  imports: [ParsingModule],
  providers: [
    // -- Shared database client --
    {
      provide: DATABASE_CLIENT,
      useFactory: () => {
        const url = process.env['DATABASE_URL'];
        if (!url) throw new Error('DATABASE_URL is not set');
        return createDatabaseClient(url, 5);
      },
    },

    // -- AI providers --
    {
      provide: ResumeExtractor,
      useFactory: () => new ResumeExtractor(),
    },
    {
      provide: AtsScorer,
      useFactory: () => new AtsScorer(),
    },
    {
      provide: ResumeOptimizer,
      useFactory: () => new ResumeOptimizer(),
    },

    // -- Processors --
    ResumeParseProcessor,
    AtsScoreProcessor,
    ResumeOptimizeProcessor,

    // -- BullMQ workers --
    {
      provide: 'RESUME_PARSE_WORKER',
      useFactory: (
        processor: ResumeParseProcessor,
        db: ReturnType<typeof createDatabaseClient>,
      ): Worker => createResumeParseWorker(processor, db),
      inject: [ResumeParseProcessor, DATABASE_CLIENT],
    },
    {
      provide: 'ATS_SCORE_WORKER',
      useFactory: (
        processor: AtsScoreProcessor,
        db: ReturnType<typeof createDatabaseClient>,
      ): Worker => createAtsScoreWorker(processor, db),
      inject: [AtsScoreProcessor, DATABASE_CLIENT],
    },
    {
      provide: 'RESUME_OPTIMIZE_WORKER',
      useFactory: (
        processor: ResumeOptimizeProcessor,
        db: ReturnType<typeof createDatabaseClient>,
      ): Worker => createResumeOptimizeWorker(processor, db),
      inject: [ResumeOptimizeProcessor, DATABASE_CLIENT],
    },
  ],
})
export class WorkerAiModule implements OnApplicationShutdown {
  private readonly logger = new Logger(WorkerAiModule.name);

  async onApplicationShutdown(): Promise<void> {
    this.logger.log('WorkerAiModule shutting down — BullMQ workers will drain');
  }
}
