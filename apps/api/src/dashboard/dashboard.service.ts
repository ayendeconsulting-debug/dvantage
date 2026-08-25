import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  resumeVersions,
  jobDescriptions,
  atsScores,
  subscriptions,
  usageEvents,
  type DatabaseClient,
} from '@vantage/database';
import { DATABASE_CLIENT } from '../database/database.module';
import type { DashboardResponseDto } from './dto/dashboard-response.dto';

/**
 * Mirror of FREE_LIMITS from SubscriptionService.
 * Source of truth lives in subscription.service.ts — keep these in sync.
 */
const FREE_LIMITS = {
  ats_score: 3,
  optimization: 1,
  job_created: 3,
} as const;

type UsageEventType = 'ats_score' | 'optimization' | 'job_created';

type RecentResumeRow = {
  id: string;
  fileName: string;
  parseStatus: string;
  createdAt: Date | string;
};

type RecentScoreRow = {
  id: string;
  overallScore: number;
  scoringStatus: string;
  resumeVersionId: string;
  jobDescriptionId: string;
  createdAt: Date | string;
  jobTitle: string | null | undefined;
  company: string | null | undefined;
};

@Injectable()
export class DashboardService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseClient) {}

  async getSummary(userId: string): Promise<DashboardResponseDto> {
    const [plan, recentResumes, recentScores, usageCounts] = await Promise.all([
      this.getPlan(userId),
      this.getRecentResumes(userId),
      this.getRecentScores(userId),
      this.getMonthlyUsageCounts(userId),
    ]);

    const isPremium = plan === 'premium';

    return {
      plan,
      usage: {
        atsScores: {
          used: usageCounts.ats_score,
          limit: isPremium ? null : FREE_LIMITS.ats_score,
        },
        optimizations: {
          used: usageCounts.optimization,
          limit: isPremium ? null : FREE_LIMITS.optimization,
        },
        jobsCreated: {
          used: usageCounts.job_created,
          limit: isPremium ? null : FREE_LIMITS.job_created,
        },
      },
      recentResumes: recentResumes.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        parseStatus: r.parseStatus,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
      recentScores: recentScores.map((s) => ({
        scoreId: s.id,
        jobDescriptionId: s.jobDescriptionId,
        resumeVersionId: s.resumeVersionId,
        jobTitle: s.jobTitle ?? null,
        company: s.company ?? null,
        overallScore: Number(s.overallScore),
        scoringStatus: s.scoringStatus,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getPlan(userId: string): Promise<'free' | 'premium'> {
    const [row] = await (this.db as any)
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    return (row?.plan ?? 'free') as 'free' | 'premium';
  }

  private async getRecentResumes(userId: string): Promise<RecentResumeRow[]> {
    return (this.db as any)
      .select({
        id: resumeVersions.id,
        fileName: resumeVersions.fileName,
        parseStatus: resumeVersions.parseStatus,
        createdAt: resumeVersions.createdAt,
      })
      .from(resumeVersions)
      .where(and(eq(resumeVersions.userId, userId), isNull(resumeVersions.deletedAt)))
      .orderBy(desc(resumeVersions.createdAt))
      .limit(3) as Promise<RecentResumeRow[]>;
  }

  private async getRecentScores(userId: string): Promise<RecentScoreRow[]> {
    return (this.db as any)
      .select({
        id: atsScores.id,
        overallScore: atsScores.overallScore,
        scoringStatus: atsScores.scoringStatus,
        resumeVersionId: atsScores.resumeVersionId,
        jobDescriptionId: atsScores.jobDescriptionId,
        createdAt: atsScores.createdAt,
        jobTitle: jobDescriptions.title,
        company: jobDescriptions.company,
      })
      .from(atsScores)
      .innerJoin(jobDescriptions, eq(atsScores.jobDescriptionId, jobDescriptions.id))
      .where(eq(jobDescriptions.userId, userId))
      .orderBy(desc(atsScores.createdAt))
      .limit(5) as Promise<RecentScoreRow[]>;
  }

  private async getMonthlyUsageCounts(userId: string): Promise<Record<UsageEventType, number>> {
    const rows = await (this.db as any)
      .select({
        eventType: usageEvents.eventType,
        total: count(),
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          sql`date_trunc('month', ${usageEvents.createdAt}) = date_trunc('month', now())`,
        ),
      )
      .groupBy(usageEvents.eventType);

    const result: Record<UsageEventType, number> = {
      ats_score: 0,
      optimization: 0,
      job_created: 0,
    };

    for (const row of rows as Array<{ eventType: string; total: number }>) {
      if (row.eventType in result) {
        result[row.eventType as UsageEventType] = row.total;
      }
    }

    return result;
  }
}
