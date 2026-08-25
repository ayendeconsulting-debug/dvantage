import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule, REDIS_CLIENT } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { RedisThrottlerStorageService } from './common/throttler/redis-throttler.storage';
import { StorageModule } from './storage/storage.module';
import { ParsingModule } from './parsing/parsing.module';
import { ResumeModule } from './resume/resume.module';
import { JobModule } from './job/job.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ApplicationModule } from './application/application.module';
import { ExtensionModule } from './extension/extension.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: 'short', ttl: 1_000, limit: 10 },
          { name: 'medium', ttl: 60_000, limit: 200 },
        ],
        storage: new RedisThrottlerStorageService(redis),
      }),
    }),
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    StorageModule,
    ParsingModule,
    ResumeModule,
    JobModule,
    SubscriptionModule,
    DashboardModule,
    ApplicationModule,
    ExtensionModule,
    UsersModule,
  ],
  providers: [
    // ThrottlerGuard was configured above but never REGISTERED, so every rate
    // limit in the product was inert — including on the unmetered extension AI
    // endpoints. Registering it here is what makes ThrottlerModule real.
    //
    // Two things this depends on, both handled:
    //   1. trustProxy is 1, not true (main.ts). With `true`, Fastify takes the
    //      leftmost X-Forwarded-For entry, which is client-supplied — every
    //      per-IP limit would be bypassable by setting a header.
    //   2. @SkipThrottle() on HealthController and StripeWebhookController.
    //      Fly probes /health every 30s from a narrow IP range and Stripe
    //      bursts webhook retries; throttling either turns this guard into an
    //      outage. See those files for the reasoning.
    //
    // Order matters: guards run in registration order, so throttling is
    // evaluated BEFORE AuthGuard (registered in AuthModule). That is
    // deliberate — an unauthenticated flood should be rejected before it
    // costs a session lookup.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
