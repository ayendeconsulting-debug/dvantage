import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * Run from packages/database/:
 *   pnpm db:generate   — generate a migration from schema changes
 *   pnpm db:migrate    — apply pending migrations
 *   pnpm db:studio     — open Drizzle Studio (local dev only)
 *
 * DATABASE_URL defaults to the local Docker Compose value so generate/migrate
 * work out of the box without setting env vars in dev.
 * CI and production pick up the real URL via Doppler → environment variable.
 */
export default defineConfig({
  schema:  './src/schema/index.ts',
  out:     './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://vantage:vantage@localhost:5432/vantage',
  },
  // Verbose migration output in development
  verbose: process.env['NODE_ENV'] !== 'production',
  strict:  true,
});
