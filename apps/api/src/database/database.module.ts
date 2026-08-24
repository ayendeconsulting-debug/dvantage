import { Module, type OnApplicationShutdown, Logger } from '@nestjs/common';
import { createDatabaseClient, type DatabaseClient } from '@vantage/database';

export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      useFactory: (): DatabaseClient => {
        const url = process.env['DATABASE_URL'];
        if (!url) {
          throw new Error('DATABASE_URL environment variable is not set');
        }

        const maxConnections = parseInt(process.env['DATABASE_MAX_CONNECTIONS'] ?? '20', 10);

        const logger = new Logger('DatabaseModule');
        logger.log(`Connecting to PostgreSQL (max ${maxConnections} connections)`);

        return createDatabaseClient(url, maxConnections);
      },
    },
  ],
  exports: [DATABASE_CLIENT],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  onApplicationShutdown(): void {
    // postgres.js manages its own connection pool lifecycle.
    // Drizzle does not expose an explicit close method — the pool
    // drains automatically when the process exits.
    this.logger.log('Database connections draining...');
  }
}
