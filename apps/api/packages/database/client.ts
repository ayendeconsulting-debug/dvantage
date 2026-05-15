import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

/**
 * Drizzle database client.
 *
 * Created once per process. The connection pool is managed by postgres.js.
 * Use the exported `db` singleton in all repository/service classes.
 *
 * Do NOT create a new drizzle() instance per request.
 */

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function createDatabaseClient(connectionString: string, maxConnections = 20) {
  const sql = postgres(connectionString, {
    max: maxConnections,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {}, // suppress NOTICE-level Postgres messages
  });

  return drizzle(sql, { schema, logger: process.env['NODE_ENV'] === 'development' });
}

/**
 * Module-level singleton — call initDatabase() at app bootstrap,
 * then import `db` everywhere else.
 */
export let db: ReturnType<typeof createDatabaseClient>;

export function initDatabase(connectionString: string, maxConnections?: number): void {
  if (_db !== undefined) {
    throw new Error('Database already initialized. Call initDatabase() once at boot.');
  }
  db = createDatabaseClient(connectionString, maxConnections);
  _db = db;
}

export type DatabaseClient = typeof db;
