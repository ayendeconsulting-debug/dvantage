// ---------------------------------------------------------------------------
// GET /v1/resumes/:id/optimizations — response types
// ---------------------------------------------------------------------------

export interface ResumeOptimizationItemDto {
  atsScoreId: string;
  jobId: string;
  jobTitle: string | null;
  jobCompany: string | null;
  optimizedAt: string; // ISO 8601
}

export interface ResumeOptimizationListDto {
  data: ResumeOptimizationItemDto[];
}
