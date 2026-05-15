/**
 * AIService — provider abstraction stub.
 * Full implementation in Milestone 3.
 *
 * This stub satisfies import requirements and documents the interface
 * so other packages can be written against the contract.
 */

export interface AIServiceConfig {
  openaiApiKey: string;
  anthropicApiKey: string;
  defaultTier?: 'quality' | 'balanced' | 'economy';
}

export class AIService {
  constructor(_config: AIServiceConfig) {
    // Implemented in Milestone 3
  }
}
