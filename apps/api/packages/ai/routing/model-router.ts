/**
 * Model routing — stub, implemented in Milestone 3.
 *
 * Quality-first defaults. Tier can be overridden per-call.
 * Changing the default model is a config change, not a refactor.
 */

export type ModelTier = 'quality' | 'balanced' | 'economy';

export interface ModelRoute {
  provider: 'openai' | 'anthropic';
  model: string;
  tier: ModelTier;
  maxTokens: number;
}

export const MODEL_ROUTES: Record<string, Record<ModelTier, ModelRoute>> = {
  'resume-optimize': {
    quality: { provider: 'anthropic', model: 'claude-opus-4-5', tier: 'quality', maxTokens: 4096 },
    balanced: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      tier: 'balanced',
      maxTokens: 4096,
    },
    economy: { provider: 'openai', model: 'gpt-4o-mini', tier: 'economy', maxTokens: 4096 },
  },
  'ats-score': {
    quality: { provider: 'openai', model: 'gpt-4o', tier: 'quality', maxTokens: 2048 },
    balanced: { provider: 'openai', model: 'gpt-4o', tier: 'balanced', maxTokens: 2048 },
    economy: { provider: 'openai', model: 'gpt-4o-mini', tier: 'economy', maxTokens: 2048 },
  },
  'resume-parse': {
    quality: { provider: 'openai', model: 'gpt-4o', tier: 'quality', maxTokens: 2048 },
    balanced: { provider: 'openai', model: 'gpt-4o-mini', tier: 'balanced', maxTokens: 2048 },
    economy: { provider: 'openai', model: 'gpt-4o-mini', tier: 'economy', maxTokens: 2048 },
  },
  'cover-letter': {
    quality: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      tier: 'quality',
      maxTokens: 2048,
    },
    balanced: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      tier: 'balanced',
      maxTokens: 2048,
    },
    economy: { provider: 'openai', model: 'gpt-4o-mini', tier: 'economy', maxTokens: 2048 },
  },
} as const;
