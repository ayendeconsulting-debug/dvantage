import { Module } from '@nestjs/common';

import { AtsScorer } from '@vantage/ai';

import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { RedisModule } from '../redis/redis.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { ExtensionAuthService } from './extension-auth.service';
import { ExtensionAuthGuard } from './extension-auth.guard';
import { ExtensionAuthController } from './extension-auth.controller';
import { ExtensionScoreService } from './extension-score.service';
import { ExtensionScoreController } from './extension-score.controller';
import { ExtensionProfileService } from './extension-profile.service';
import { ExtensionProfileController } from './extension-profile.controller';
import { ExtensionCaptureService } from './extension-capture.service';
import { ExtensionCaptureController } from './extension-capture.controller';
import { ExtensionAiFillService } from './extension-ai-fill.service';
import { ExtensionAiFillController } from './extension-ai-fill.controller';

/**
 * ExtensionModule — owns all Chrome extension API surface (/v1/extension/*).
 *
 * D13 Tier B:
 *   ExtensionAiFillService  — Claude call to generate form field answers
 *   ExtensionAiFillController — POST /v1/extension/ai-fill
 */
@Module({
  // SubscriptionModule added 2026-08-24. The extension was a second API
  // surface that skipped the first one's rules entirely: the web scoring path
  // calls assertCanScore + recordUsage, this one called neither. A free-tier
  // user capped at 3 scores/month in the dashboard had unlimited scoring
  // through the extension, at two Claude calls each, unmetered and invisible
  // to the usage meters.
  //
  // RedisModule backs the per-user daily AI-fill ceiling in
  // ExtensionAiFillService — see the note there on why that is not a
  // usage_events row.
  imports: [DatabaseModule, StorageModule, RedisModule, SubscriptionModule],
  providers: [
    ExtensionAuthService,
    ExtensionAuthGuard,
    ExtensionScoreService,
    ExtensionProfileService,
    ExtensionCaptureService,
    ExtensionAiFillService,
    {
      provide: AtsScorer,
      useFactory: (): AtsScorer => new AtsScorer(),
    },
  ],
  controllers: [
    ExtensionAuthController,
    ExtensionScoreController,
    ExtensionProfileController,
    ExtensionCaptureController,
    ExtensionAiFillController,
  ],
  exports: [ExtensionAuthService, ExtensionAuthGuard],
})
export class ExtensionModule {}
