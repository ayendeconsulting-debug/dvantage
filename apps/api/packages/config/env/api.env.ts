import { z } from 'zod';
import { sharedEnvSchema } from './shared.env';

const apiEnvSchema = sharedEnvSchema.extend({
  APP_PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(100).default(20),

  // Object storage
  R2_ENDPOINT: z.string().url(),
  R2_BUCKET_RESUMES: z.string().min(1),
  R2_BUCKET_EXPORTS: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_PUBLIC_URL: z.string().url(),

  // AWS KMS
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  KMS_KEY_ID_OAUTH_TOKENS: z.string().min(1),

  // Auth
  AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  MICROSOFT_CLIENT_ID: z.string().min(1),
  MICROSOFT_CLIENT_SECRET: z.string().min(1),

  // AI
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),

  // Payments
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  STRIPE_PRICE_ID_PREMIUM_MONTHLY: z.string().startsWith('price_'),
  STRIPE_PRICE_ID_PREMIUM_ANNUAL: z.string().startsWith('price_'),

  // Email
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email(),

  // Feature flags
  STATSIG_SERVER_SDK_KEY: z.string().min(1),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function parseApiEnv(env: Record<string, string | undefined>): ApiEnv {
  const result = apiEnvSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`❌ Invalid API environment configuration:\n${formatted}`);
  }
  return result.data;
}
