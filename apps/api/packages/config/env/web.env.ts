import { z } from 'zod';

// Next.js requires NEXT_PUBLIC_ prefix for browser-visible vars.
// Server-side vars are validated at build/boot time.
const webEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  NEXT_PUBLIC_STATSIG_CLIENT_SDK_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function parseWebEnv(env: Record<string, string | undefined>): WebEnv {
  const result = webEnvSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`❌ Invalid web environment configuration:\n${formatted}`);
  }
  return result.data;
}
