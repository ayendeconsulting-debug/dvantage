import type { ScoringStatus, OptimizationStatus } from '@vantage/database';
import type { ATSSectionScores } from '@vantage/validation';

// ---------------------------------------------------------------------------
// List item — lightweight, no full keyword arrays
// ---------------------------------------------------------------------------

export interface AtsScoreListItemDto {
  id:               string;
  resumeVersionId:  string;
  jobDescriptionId: string;
  scoringStatus:    ScoringStatus;
  overallScore:     number | null;
  createdAt:        string; // ISO 8601
  updatedAt:        string;
}

// ---------------------------------------------------------------------------
// List response
// ---------------------------------------------------------------------------

export interface AtsScoreListResponseDto {
  data:  AtsScoreListItemDto[];
  total: number;
}

// ---------------------------------------------------------------------------
// Full detail — includes all section scores, gaps, and recommendations
// ---------------------------------------------------------------------------

export interface AtsScoreDetailDto {
  id:               string;
  resumeVersionId:  string;
  jobDescriptionId: string;

  // Scoring
  scoringStatus:    ScoringStatus;
  overallScore:     number | null;
  sectionScores:    ATSSectionScores | null;
  keywordGaps:      string[] | null;
  matchedKeywords:  string[] | null;
  recommendations:  string[] | null;
  scoreError:       string | null;

  // Optimization (populated in M3-C)
  optimizationStatus: OptimizationStatus;

  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Create response — returned immediately after enqueuing
// ---------------------------------------------------------------------------

export interface CreateAtsScoreResponseDto {
  atsScoreId:    string;
  scoringStatus: ScoringStatus;
  message:       string;
}
