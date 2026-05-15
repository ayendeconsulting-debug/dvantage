/**
 * @vantage/database
 *
 * Drizzle ORM schema definitions, migration tooling, and query helpers.
 * All tables follow the locked schema conventions:
 *   - PKs: UUID v7
 *   - Columns: snake_case
 *   - Tables: plural
 *   - Timestamps: created_at, updated_at on every row
 *   - JSON: jsonb only
 *   - Money: integer cents
 *
 * Populated in Milestone 0 (connection) and expanded each milestone.
 */

export { db, createDatabaseClient, initDatabase, type DatabaseClient } from './client';
export * from './schema/index';
