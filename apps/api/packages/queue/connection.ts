import { Redis } from 'ioredis';

/**
 * Creates an ioredis connection for BullMQ.
 *
 * BullMQ requires its own connection instance — do not share with
 * the application Redis client used for sessions and caching.
 * `maxRetriesPerRequest: null` is required by BullMQ.
 */
export function createQueueConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
}
