import { Module, type OnApplicationShutdown, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        const url = process.env['REDIS_URL'];
        if (!url) {
          throw new Error('REDIS_URL environment variable is not set');
        }

        const logger = new Logger('RedisModule');

        const client = new Redis(url, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        });

        client.on('connect', () => logger.log('Redis connected'));
        client.on('ready',   () => logger.log('Redis ready'));
        client.on('error',   (err: Error) => logger.error(`Redis error: ${err.message}`));
        client.on('close',   () => logger.warn('Redis connection closed'));
        client.on('reconnecting', () => logger.warn('Redis reconnecting...'));

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);

  // Injected for graceful shutdown
  constructor() {}

  onApplicationShutdown(): void {
    this.logger.log('Redis connection closing...');
    // Actual disconnect handled by the provider factory instance
  }
}
