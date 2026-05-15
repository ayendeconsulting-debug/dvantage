import type { OptimizationStatus } from '@vantage/database';
import type { ResumeData, OptimizationChange } from '@vantage/validation';

// ---------------------------------------------------------------------------
// Trigger response — returned immediately after enqueuing
// ---------------------------------------------------------------------------

export interface OptimizationStatusDto {
  atsScoreId:         string;
  optimizationStatus: OptimizationStatus;
  message:            string;
}

// ---------------------------------------------------------------------------
// Poll response — returned on GET, includes data when complete
// ---------------------------------------------------------------------------

export interface OptimizationResultDto {
  atsScoreId:         string;
  optimizationStatus: OptimizationStatus;
  /** Populated when optimizationStatus is 'complete'. */
  optimizedData:      ResumeData | null;
  /** Structured list of every change made and its rationale. */
  changeLog:          OptimizationChange[] | null;
  /** Populated when optimizationStatus is 'failed'. */
  optimizationError:  string | null;
}
