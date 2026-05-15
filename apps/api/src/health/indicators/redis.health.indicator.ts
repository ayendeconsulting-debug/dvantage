import { Inject, Injectable, Logger } from '@nestjs/common';
import { HealthIndicator, type HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { type Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected PING response: ${pong}`);
      }
      const responseTime = Date.now() - start;

      return this.getStatus(key, true, { responseTime });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Redis error';
      this.logger.error(`Redis health check failed: ${message}`);
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, { message }),
      );
    }
  }
}
