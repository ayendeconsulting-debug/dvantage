import { Module } from '@nestjs/common';
import { JobService }         from './job.service';
import { AtsScoreService }    from './ats-score.service';
import { OptimizeService }    from './optimize.service';
import { JobController }      from './job.controller';
import { ResumePdfService }   from '../resume/export/resume-pdf.service';
import { ResumeDocxService }  from '../resume/export/resume-docx.service';
import { DatabaseModule }     from '../database/database.module';
import { SubscriptionModule } from '../subscription/subscription.module';

/**
 * JobModule
 *
 * Owns all job description, ATS scoring, and resume optimization logic.
 *
 * M3-A — Job description CRUD
 * M3-B — ATS scoring (create, list, get)
 * M3-C — AI resume optimization (request, poll/retrieve)
 * M4-C — Entitlement enforcement via SubscriptionService
 * M5   — Optimized resume export PDF + DOCX
 */
@Module({
  imports:     [DatabaseModule, SubscriptionModule],
  providers:   [JobService, AtsScoreService, OptimizeService, ResumePdfService, ResumeDocxService],
  controllers: [JobController],
  exports:     [JobService, AtsScoreService, OptimizeService],
})
export class JobModule {}
