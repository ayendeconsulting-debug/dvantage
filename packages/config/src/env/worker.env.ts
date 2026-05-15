import { z } from 'zod';
import { sharedEnvSchema } from './shared.env';

const workerEnvSchema = sharedEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  R2_ENDPOINT: z.string().url(),
  R2_BUCKET_RESUMES: z.string().min(1),
  R2_BUCKET_EXPORTS: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseWorkerEnv(env: Record<string, string | undefined>): WorkerEnv {
  const result = workerEnvSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`❌ Invalid worker environment configuration:\n${formatted}`);
  }
  return result.data;
}
