import { Module }          from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Redis }      from 'ioredis';
import { HealthModule }        from './health/health.module';
import { DatabaseModule }      from './database/database.module';
import { RedisModule, REDIS_CLIENT } from './redis/redis.module';
import { AuthModule }          from './auth/auth.module';
import { RedisThrottlerStorageService } from './common/throttler/redis-throttler.storage';
import { StorageModule }       from './storage/storage.module';
import { ParsingModule }       from './parsing/parsing.module';
import { ResumeModule }        from './resume/resume.module';
import { JobModule }           from './job/job.module';
import { SubscriptionModule }  from './subscription/subscription.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ApplicationModule } from './application/application.module';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({clear
      
      imports:    [RedisModule],
      inject:     [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: 'short',  ttl:  1_000, limit:  10 },
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
  ],
})
export class AppModule {}
