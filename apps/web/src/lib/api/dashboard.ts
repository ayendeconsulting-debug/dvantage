const API_BASE =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types — mirror of DashboardResponseDto on the API side
// ---------------------------------------------------------------------------

export interface UsageMetric {
  used: number;
  /** null = unlimited (premium plan) */
  limit: number | null;
}

export interface DashboardUsage {
  atsScores: UsageMetric;
  optimizations: UsageMetric;
  jobsCreated: UsageMetric;
}

export interface RecentResume {
  id: string;
  fileName: string;
  parseStatus: string;
  createdAt: string;
}

export interface RecentScore {
  scoreId: string;
  jobDescriptionId: string;
  resumeVersionId: string;
  jobTitle: string | null;
  company: string | null;
  overallScore: number;
  scoringStatus: string;
  createdAt: string;
}

export interface DashboardData {
  plan: 'free' | 'premium';
  usage: DashboardUsage;
  recentResumes: RecentResume[];
  recentScores: RecentScore[];
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function getDashboard(): Promise<DashboardData> {
  const res = await fetch(`${API_BASE}/v1/dashboard`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`getDashboard: HTTP ${res.status}`);
  }

  return res.json() as Promise<DashboardData>;
}
