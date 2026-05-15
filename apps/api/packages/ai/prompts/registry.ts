/**
 * Prompt registry — stub, expanded in Milestone 3.
 *
 * All system prompts live here. No prompt strings scattered in services.
 * Each entry is versioned so prompt changes are auditable.
 */

export const PROMPT_REGISTRY = {
  RESUME_PARSE_V1: 'resume-parse-v1',
  RESUME_OPTIMIZE_V1: 'resume-optimize-v1',
  ATS_SCORE_V1: 'ats-score-v1',
  COVER_LETTER_V1: 'cover-letter-v1',
} as const;

export type PromptKey = (typeof PROMPT_REGISTRY)[keyof typeof PROMPT_REGISTRY];
