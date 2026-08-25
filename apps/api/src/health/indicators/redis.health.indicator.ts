import { Inject, Injectable, Logger } from '@nestjs/common';
import { HealthIndicator, type HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { type Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  /**
   * Strict check — throws when Redis is unreachable.
   *
   * Do NOT wire this into the endpoint Fly probes. Redis is a cache and a
   * queue broker, not a liveness dependency: see isHealthyOptional below.
   * Kept for diagnostics and for any future caller that genuinely cannot
   * proceed without Redis.
   */
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
      throw new HealthCheckError('Redis check failed', this.getStatus(key, false, { message }));
    }
  }

  /**
   * Degraded-tolerant check — never throws.
   *
   * INCIDENT 2026-08-24: the Upstash free-tier database was archived after 30
   * days of inactivity. isHealthy() threw, Terminus failed the whole check,
   * GET /health returned 503, the Fly health check marked the machine
   * unhealthy, an unhealthy machine stopped counting toward
   * min_machines_running, auto_stop_machines parked it, and the API went
   * fully dark — CORS errors in the browser, no login, for a dependency that
   * is a cache.
   *
   * A cache outage must degrade the service, never remove it from the load
   * balancer. This returns status 'up' with `degraded: true` so the endpoint
   * still answers 200 while reporting the truth in its payload. Alert on
   * `info.redis.degraded === true`, not on the HTTP status.
   */
  async isHealthyOptional(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected PING response: ${pong}`);
      }
      return this.getStatus(key, true, {
        responseTime: Date.now() - start,
        degraded: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Redis error';
      this.logger.error(
        `Redis DEGRADED — cache and queue unavailable, API still serving: ${message}`,
      );
      return this.getStatus(key, true, { degraded: true, message });
    }
  }
}
