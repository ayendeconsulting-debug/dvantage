// ---------------------------------------------------------------------------
// POST /v1/extension/score — Response DTO
//
// Shape mirrors the ScoreResult interface in the extension's shared/types.ts.
// Any change here must be reflected in ScoreResult — keep in sync.
// ---------------------------------------------------------------------------

/**
 * Returned synchronously from POST /v1/extension/score.
 * The extension's ScorePanel renders this directly via isValidScoreResult().
 */
export interface ExtensionScoreResponseDto {
  /** ATS match score 0–100. */
  score: number;

  /**
   * Missing keywords from the job description not present in the resume.
   * Maps from AtsScorer.keyword_gaps[].
   */
  keywordGaps: string[];

  /**
   * Semantic-level improvement recommendations.
   * Maps from AtsScorer.recommendations[] — experience, framing, and
   * impact-statement gaps that keywords alone don't capture.
   */
  semanticGaps: string[];

  /**
   * Deep link to the web app.
   * D9: links to /dashboard (generic entry point).
   * D13: updated to /dashboard/jobs/:jobId/scores/:scoreId after capture.
   */
  optimizationUrl: string;
}
