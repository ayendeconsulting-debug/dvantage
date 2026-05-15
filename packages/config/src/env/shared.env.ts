import { z } from 'zod';

export const sharedEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  REDIS_URL: z.string().url(),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().default('development'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
});

export type SharedEnv = z.infer<typeof sharedEnvSchema>;
