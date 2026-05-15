/**
 * @vantage/ai
 *
 * AI provider abstraction — Anthropic via @anthropic-ai/sdk.
 * Implements quality-first model routing with hot-swap capability:
 * changing the default model requires no refactors downstream.
 */

export { AIService, type AIServiceConfig }       from './service/ai.service';
export { type ModelRoute, type ModelTier }        from './routing/model-router';
export { PROMPT_REGISTRY }                        from './prompts/registry';
export { ResumeExtractor }                        from './extractors/resume.extractor';
export { AtsScorer }                              from './scorers/ats.scorer';
export { ResumeOptimizer, type OptimizationResult } from './optimizers/resume.optimizer';
