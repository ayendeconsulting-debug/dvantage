// ---------------------------------------------------------------------------
// ExtensionScoreService
//
// Synchronously scores a job description against a user's resume.
// Called by POST /v1/extension/score (ExtensionScoreController).
//
// Design decisions (D9):
//   - Synchronous: AtsScorer runs inline (no queue). Returns in ~3–8s.
//   - No DB persistence: scores are ephemeral. D13 handles capture + storage.
//   - Resume resolution: explicit resumeId > MRU complete version.
//   - optimizationUrl: /dashboard for D9; deep-linked in D13.
//
// Future (D-classify):
//   The extension will call POST /v1/extension/classify before REQUEST_SCORE,
//   receive the matched Resume Category's resumeId, and pass it here.
//   This service receives a resumeId and scores — it is category-agnostic.
//   Zero rework required when the classify endpoint ships.
// ---------------------------------------------------------------------------

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { AtsScorer } from '@vantage/ai';
import { resumeVersions, type DatabaseClient, type ExtensionToken } from '@vantage/database';
import type { ResumeData } from '@vantage/validation';

import { DATABASE_CLIENT } from '../database/database.module';
import { SubscriptionService } from '../subscription/subscription.service';
import type { ExtensionScoreRequestDto } from './dto/extension-score-request.dto';
import type { ExtensionScoreResponseDto } from './dto/extension-score-response.dto';

// Web app base URL — used for the optimization deep link returned to the extension.
// D13 replaces this with a per-job deep link once the application row is captured.
const APP_BASE_URL = process.env['APP_BASE_URL'] ?? 'https://dvantage.ca';

@Injectable()
export class ExtensionScoreService {
  private readonly logger = new Logger(ExtensionScoreService.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseClient,
    private readonly atsScorer: AtsScorer,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  // ---------------------------------------------------------------------------
  // score — public API
  // ---------------------------------------------------------------------------

  /**
   * Score a job description against the resolved resume.
   * Runs AtsScorer synchronously and returns the result immediately.
   * No DB write is performed — the score is ephemeral.
   */
  async score(
    token: ExtensionToken,
    dto: ExtensionScoreRequestDto,
  ): Promise<ExtensionScoreResponseDto> {
    // Entitlement check BEFORE any Claude spend. Throws PaymentRequiredException
    // (402) with an upgradeUrl when a free user is over their monthly limit.
    //
    // Meters against 'ats_score' — the same bucket as the web endpoint, on
    // purpose. It is the same product action; a user who scores three jobs
    // should have used three scores regardless of which surface they used.
    // Doing it this way also needs no enum migration.
    //
    // Known limitation (audit BILL-4, deferred): assertQuota is a read-then-act
    // with no lock, so concurrent requests can each pass a limit of N. The
    // @Throttle on this route caps the burst that could exploit it. The real
    // fix is an atomic usage counter and is tracked separately.
    await this.subscriptionService.assertCanScore(token.userId);

    const resume = await this.resolveResume(token.userId, dto.resumeId);

    this.logger.log(
      `Extension score start — user=${token.userId} resume=${resume.id} ` +
        `jdLength=${dto.jobDescription.length} explicit=${dto.resumeId !== null}`,
    );

    const atsScore = await this.atsScorer.score(
      resume.structuredData as ResumeData,
      dto.jobDescription,
    );

    // Recorded AFTER the model call succeeds. If AtsScorer throws — an
    // Anthropic 429/529, a validation failure — the user is not charged a
    // score for work they did not receive. Safe to do here because this path
    // is synchronous; the queued web path cannot make the same guarantee.
    await this.subscriptionService.recordUsage(token.userId, 'ats_score');

    this.logger.log(`Extension score complete — user=${token.userId} overall=${atsScore.overall}`);

    return {
      score: atsScore.overall,
      keywordGaps: atsScore.keyword_gaps,
      semanticGaps: atsScore.recommendations,
      optimizationUrl: `${APP_BASE_URL}/dashboard`,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve the resume version to score against.
   *
   * Resolution order:
   *   1. resumeId non-null → explicit version (must be owned by this user + complete).
   *      Future: populated by POST /v1/extension/classify from the matched category.
   *   2. resumeId null → MRU: most-recently-created complete version for this user.
   *      Current default for Free tier and any Premium user without a classify result.
   *
   * Throws:
   *   404 — explicit resumeId not found / not owned by user
   *   422 — explicit resume not fully parsed, or no complete resume exists at all
   */
  private async resolveResume(
    userId: string,
    resumeId: string | null,
  ): Promise<ReturnType<typeof this.assertComplete>> {
    if (resumeId !== null) {
      const [row] = await this.db
        .select()
        .from(resumeVersions)
        .where(
          and(
            eq(resumeVersions.id, resumeId),
            eq(resumeVersions.userId, userId),
            isNull(resumeVersions.deletedAt),
          ),
        )
        .limit(1);

      if (!row) {
        throw new NotFoundException(
          `Resume version "${resumeId}" not found or does not belong to this user.`,
        );
      }

      return this.assertComplete(row, resumeId);
    }

    // MRU — most-recently-created fully parsed resume
    const [row] = await this.db
      .select()
      .from(resumeVersions)
      .where(
        and(
          eq(resumeVersions.userId, userId),
          eq(resumeVersions.parseStatus, 'complete'),
          isNull(resumeVersions.deletedAt),
        ),
      )
      .orderBy(desc(resumeVersions.createdAt))
      .limit(1);

    if (!row || !row.structuredData) {
      throw new UnprocessableEntityException(
        'No parsed resume found. Upload and parse a resume at dvantage.ca before scoring.',
      );
    }

    return row;
  }

  /**
   * Assert that a resume version has completed parsing and structured data.
   * Throws 422 with a clear message if the assertion fails.
   */
  private assertComplete<T extends { parseStatus: string; structuredData: unknown; id: string }>(
    row: T,
    resumeId: string,
  ): T {
    if (row.parseStatus !== 'complete' || !row.structuredData) {
      throw new UnprocessableEntityException(
        `Resume version "${resumeId}" is not fully parsed ` +
          `(status: ${row.parseStatus}). Scoring requires parse status "complete".`,
      );
    }
    return row;
  }
}
