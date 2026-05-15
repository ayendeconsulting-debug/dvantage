/**
 * @vantage/config
 *
 * Centralised environment variable validation using Zod.
 * All apps import their env schema from here to guarantee
 * consistent parsing and clear startup errors.
 *
 * Usage:
 *   import { parseApiEnv } from '@vantage/config';
 *   export const env = parseApiEnv(process.env);
 */

export { parseApiEnv, type ApiEnv } from './env/api.env';
export { parseWorkerEnv, type WorkerEnv } from './env/worker.env';
export { parseWebEnv, type WebEnv } from './env/web.env';
export { sharedEnvSchema, type SharedEnv } from './env/shared.env';
