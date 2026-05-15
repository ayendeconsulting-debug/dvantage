/**
 * @vantage/ai
 *
 * Provider abstraction over OpenAI and Anthropic via the Vercel AI SDK.
 * Implements quality-first model routing with hot-swap capability:
 * changing the default model requires no refactors downstream.
 *
 * Built out in Milestone 3 (ATS Scoring + Optimization).
 * Stub present here so all packages can declare the dependency.
 */

export { AIService, type AIServiceConfig } from './service/ai.service';
export { type ModelRoute, type ModelTier } from './routing/model-router';
export { PROMPT_REGISTRY } from './prompts/registry';
