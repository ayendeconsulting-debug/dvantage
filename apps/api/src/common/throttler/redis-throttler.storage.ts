import type { Redis } from 'ioredis';

/**
 * ThrottlerStorageRecord — defined inline because @nestjs/throttler@6.5.0
 * does not export this type. The shape matches the interface the ThrottlerModule
 * internally expects from a storage provider.
 */
interface ThrottlerStorageRecord {
  totalHits:         number;
  timeToExpire:      number;
  isBlocked:         boolean;
  timeToBlockExpire: number;
}

/**
 * Redis-backed ThrottlerStorage.
 *
 * Implements the duck-typed storage interface expected by ThrottlerModule.forRoot.
 * Rate-limit counters survive API restarts and are shared across all processes.
 *
 * Key structure:
 *   throttle:hits:<name>:<key>   — sliding hit counter (pexpire — milliseconds)
 *   throttle:block:<name>:<key>  — block flag when limit is exceeded
 *
 * @nestjs/throttler v6 passes ttl in milliseconds.
 */
export class RedisThrottlerStorageService {
  constructor(private readonly redis: Redis) {}

  async increment(
    key:           string,
    ttl:           number,
    limit:         number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const blockKey = `throttle:block:${throttlerName}:${key}`;
    const hitKey   = `throttle:hits:${throttlerName}:${key}`;

    // -- Check existing block ----------------------------------------------
    const blockPttl = await this.redis.pttl(blockKey);
    if (blockPttl > 0) {
      const secs = Math.ceil(blockPttl / 1000);
      return { totalHits: limit + 1, timeToExpire: secs, isBlocked: true, timeToBlockExpire: secs };
    }

    // -- Increment hit counter ---------------------------------------------
    const pipeline = this.redis.pipeline();
    pipeline.incr(hitKey);
    pipeline.pexpire(hitKey, ttl);
    const results  = await pipeline.exec();

    const totalHits    = (results?.[0]?.[1] as number | null) ?? 1;
    const hitPttl      = await this.redis.pttl(hitKey);
    const timeToExpire = Math.ceil(Math.max(hitPttl, 0) / 1000);

    // -- Block if over limit -----------------------------------------------
    if (totalHits > limit) {
      await this.redis.set(blockKey, '1', 'PX', blockDuration);
      return {
        totalHits,
        timeToExpire,
        isBlocked:         true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }

    return { totalHits, timeToExpire, isBlocked: false, timeToBlockExpire: 0 };
  }
}
