export class UsageMetricDto {
  used!: number;
  /** null = unlimited (premium plan) */
  limit!: number | null;
}

export class DashboardUsageDto {
  atsScores!: UsageMetricDto;
  optimizations!: UsageMetricDto;
  jobsCreated!: UsageMetricDto;
}

export class RecentResumeDto {
  id!: string;
  fileName!: string;
  parseStatus!: string;
  createdAt!: string;
}

export class RecentScoreDto {
  scoreId!: string;
  jobDescriptionId!: string;
  resumeVersionId!: string;
  jobTitle!: string | null;
  company!: string | null;
  overallScore!: number;
  scoringStatus!: string;
  createdAt!: string;
}

export class DashboardResponseDto {
  plan!: 'free' | 'premium';
  usage!: DashboardUsageDto;
  recentResumes!: RecentResumeDto[];
  recentScores!: RecentScoreDto[];
}
