import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './indicators/database.health.indicator';
import { RedisHealthIndicator } from './indicators/redis.health.indicator';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Health endpoints.
 *
 * Dependency tiers — a check is only allowed to fail the response if the API
 * genuinely cannot serve traffic without it:
 *
 *   database  CRITICAL  every request path reads Postgres. Down = 503.
 *   redis     DEGRADED  cache + BullMQ broker. Down = reduced function
 *                       (no queued jobs, cold sessions), NOT down.
 *
 * INCIDENT 2026-08-24: Redis was in the critical tier. Its provider archived
 * the database, /health began returning 503, Fly parked the only machine, and
 * a cache outage became a total outage. Tiering is the fix — see
 * redis.health.indicator.ts for the full chain.
 */
/**
 * NEVER throttle health checks.
 *
 * Fly probes /health every 30s per machine from a narrow proxy IP range. With
 * ThrottlerGuard registered globally (app.module.ts) and a shared 10 req/s
 * bucket, a burst of probes plus any co-located traffic from the same
 * forwarded IP could return 429 — which Fly reads as unhealthy, which parks
 * the machine.
 *
 * That is precisely the 2026-08-24 outage, reached by a different route: a
 * health check that reports failure for a reason unrelated to the app's
 * ability to serve. Do not remove this decorator.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /**
   * Readiness — the endpoint Fly probes (fly.api.toml http_service.checks).
   * 200 while the API can serve. The payload still reports Redis honestly:
   * alert on info.redis.degraded === true.
   */
  @Get()
  @HealthCheck()
  @Public()
  check() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.redis.isHealthyOptional('redis'),
    ]);
  }

  /**
   * Liveness — process is up and the event loop is turning. No dependencies.
   * Use for restart decisions; never for routing decisions.
   */
  @Get('live')
  @Public()
  live(): { status: string; uptime: number } {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }
}
