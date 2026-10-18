import { z } from 'zod';

// ---------------------------------------------------------------------------
// Section scores — one integer score per resume section
// ---------------------------------------------------------------------------

export const atsSectionScoresSchema = z.object({
  /** Alignment between resume skills and JD-required skills. */
  skills: z.number().int().min(0).max(100),
  /** Relevance of work experience to JD requirements. */
  experience: z.number().int().min(0).max(100),
  /** Match between resume education and JD requirements. */
  education: z.number().int().min(0).max(100),
  /** Keyword coverage — how many JD keywords appear in the resume. */
  keywords: z.number().int().min(0).max(100),
});

export type ATSSectionScores = z.infer<typeof atsSectionScoresSchema>;

// ---------------------------------------------------------------------------
// Full ATS score — produced by AtsScorer, stored in ats_scores.section_scores
// ---------------------------------------------------------------------------

export const atsScoreSchema = z.object({
  /** Weighted aggregate of all section scores. 0 = no match, 100 = perfect. */
  overall: z.number().int().min(0).max(100),
  sections: atsSectionScoresSchema,
  /** JD keywords not found in the resume. Ordered by importance. */
  keyword_gaps: z.array(z.string()),
  /** JD keywords that are present in the resume. */
  matched_keywords: z.array(z.string()),
  /** Actionable, specific recommendations for improving the score. */
  recommendations: z.array(z.string()).max(10),
});

export type ATSScore = z.infer<typeof atsScoreSchema>;

// ---------------------------------------------------------------------------
// Optimization change log entry — produced by ResumeOptimizer in M3-C
// ---------------------------------------------------------------------------

export const optimizationChangeSchema = z.object({
  section: z.string(), // e.g. 'experience[0].highlights[2]'
  original: z.string(),
  optimized: z.string(),
  reason: z.string(), // why this change closes a gap
});

export type OptimizationChange = z.infer<typeof optimizationChangeSchema>;
