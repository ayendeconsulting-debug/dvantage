import { Inject, Injectable, Logger } from '@nestjs/common';
import { HealthIndicator, type HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { type DatabaseClient } from '@vantage/database';
import { DATABASE_CLIENT } from '../../database/database.module';

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(DatabaseHealthIndicator.name);

  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseClient) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      // Simple connectivity check — any query that validates the connection
      await this.db.execute(sql`SELECT 1`);
      const responseTime = Date.now() - start;

      return this.getStatus(key, true, { responseTime });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown database error';
      this.logger.error(`Database health check failed: ${message}`);
      throw new HealthCheckError('Database check failed', this.getStatus(key, false, { message }));
    }
  }
}
