/**
 * Job API client
 *
 * Typed fetch wrappers for all job description, ATS scoring, and
 * optimization endpoints. Follows the same patterns as resume.ts.
 */

const API_BASE =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Shared types (mirrored from backend DTOs)
// ---------------------------------------------------------------------------

export type ScoringStatus = 'pending' | 'scoring' | 'complete' | 'failed';
export type OptimizationStatus = 'none' | 'pending' | 'optimizing' | 'complete' | 'failed';

export interface JobDescriptionListItem {
  id: string;
  title: string | null;
  company: string | null;
  url: string | null;
  contentLength: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobDescriptionDetail {
  id: string;
  title: string | null;
  company: string | null;
  url: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobDescriptionListResponse {
  data: JobDescriptionListItem[];
  nextCursor: string | null;
  total: number;
}

export interface ATSSectionScores {
  skills: number;
  experience: number;
  education: number;
  keywords: number;
}

export interface AtsScoreListItem {
  id: string;
  resumeVersionId: string;
  jobDescriptionId: string;
  scoringStatus: ScoringStatus;
  overallScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AtsScoreListResponse {
  data: AtsScoreListItem[];
  total: number;
}

export interface AtsScoreDetail {
  id: string;
  resumeVersionId: string;
  jobDescriptionId: string;

  // Original resume scoring
  scoringStatus: ScoringStatus;
  overallScore: number | null;
  sectionScores: ATSSectionScores | null;
  keywordGaps: string[] | null;
  matchedKeywords: string[] | null;
  recommendations: string[] | null;
  scoreError: string | null;

  // Optimization
  optimizationStatus: OptimizationStatus;

  // Post-optimization re-score — null until optimizationStatus === 'complete'
  optimizedOverallScore: number | null;
  optimizedSectionScores: ATSSectionScores | null;

  createdAt: string;
  updatedAt: string;
}

export interface CreateAtsScoreResponse {
  atsScoreId: string;
  scoringStatus: ScoringStatus;
  message: string;
}

export interface OptimizationChange {
  section: string;
  original: string;
  optimized: string;
  reason: string;
}

// Minimal ResumeData shape used for diff rendering
export interface ResumeContact {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
}

export interface ResumeExperience {
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  description: string;
  highlights: string[];
}

export interface ResumeSkill {
  name: string;
  category: 'technical' | 'soft' | 'language' | 'tool';
  level?: string;
}

export interface ResumeData {
  contact: ResumeContact;
  summary: string;
  experience: ResumeExperience[];
  education: {
    institution: string;
    degree: string;
    field: string;
    startDate: string;
    endDate?: string;
  }[];
  skills: ResumeSkill[];
  certifications: { name: string; issuer: string }[];
}

export interface OptimizationResult {
  atsScoreId: string;
  optimizationStatus: OptimizationStatus;
  optimizedData: ResumeData | null;
  changeLog: OptimizationChange[] | null;
  optimizationError: string | null;
}

export interface OptimizationStatusResponse {
  atsScoreId: string;
  optimizationStatus: OptimizationStatus;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function idempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...restInit } = init ?? {};
  const hasBody = restInit.body != null;
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...initHeaders,
    },
    ...restInit,
  });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string; title?: string };
      message = body.detail ?? body.title ?? message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Job description CRUD
// ---------------------------------------------------------------------------

export async function createJob(payload: {
  content: string;
  title?: string;
  company?: string;
  url?: string;
}): Promise<JobDescriptionDetail> {
  return apiFetch<JobDescriptionDetail>('/v1/jobs', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey() },
    body: JSON.stringify(payload),
  });
}

export async function listJobs(cursor?: string): Promise<JobDescriptionListResponse> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiFetch<JobDescriptionListResponse>(`/v1/jobs${qs}`);
}

export async function getJob(id: string): Promise<JobDescriptionDetail> {
  return apiFetch<JobDescriptionDetail>(`/v1/jobs/${id}`);
}

export async function updateJob(
  id: string,
  payload: { title?: string; company?: string; url?: string },
): Promise<JobDescriptionDetail> {
  return apiFetch<JobDescriptionDetail>(`/v1/jobs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteJob(id: string): Promise<{ jobDescriptionId: string; deleted: true }> {
  return apiFetch(`/v1/jobs/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// ATS scoring
// ---------------------------------------------------------------------------

export async function createScore(
  jobId: string,
  resumeVersionId: string,
): Promise<CreateAtsScoreResponse> {
  return apiFetch<CreateAtsScoreResponse>(`/v1/jobs/${jobId}/scores`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey() },
    body: JSON.stringify({ resumeVersionId }),
  });
}

export async function listScores(jobId: string): Promise<AtsScoreListResponse> {
  return apiFetch<AtsScoreListResponse>(`/v1/jobs/${jobId}/scores`);
}

export async function getScore(jobId: string, scoreId: string): Promise<AtsScoreDetail> {
  return apiFetch<AtsScoreDetail>(`/v1/jobs/${jobId}/scores/${scoreId}`);
}

// ---------------------------------------------------------------------------
// Optimization
// ---------------------------------------------------------------------------

export async function requestOptimization(
  jobId: string,
  scoreId: string,
): Promise<OptimizationStatusResponse> {
  return apiFetch<OptimizationStatusResponse>(`/v1/jobs/${jobId}/scores/${scoreId}/optimize`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey() },
    body: '{}',
  });
}

export async function getOptimization(jobId: string, scoreId: string): Promise<OptimizationResult> {
  return apiFetch<OptimizationResult>(`/v1/jobs/${jobId}/scores/${scoreId}/optimize`);
}
