import { Module } from '@nestjs/common';

import { AtsScorer } from '@vantage/ai';

import { DatabaseModule }             from '../database/database.module';
import { StorageModule }              from '../storage/storage.module';
import { ExtensionAuthService }       from './extension-auth.service';
import { ExtensionAuthGuard }         from './extension-auth.guard';
import { ExtensionAuthController }    from './extension-auth.controller';
import { ExtensionScoreService }      from './extension-score.service';
import { ExtensionScoreController }   from './extension-score.controller';
import { ExtensionProfileService }    from './extension-profile.service';
import { ExtensionProfileController } from './extension-profile.controller';
import { ExtensionCaptureService }    from './extension-capture.service';
import { ExtensionCaptureController } from './extension-capture.controller';

/**
 * ExtensionModule
 *
 * Owns all Chrome extension API surface (/v1/extension/*).
 *
 * Phase 2 milestone map:
 *   D2–D4   Auth    — exchange / refresh / revoke    ✅ complete
 *   D5      Profile — GET /v1/extension/auth/profile ✅ complete
 *   D9      Score   — POST /v1/extension/score       ✅ complete
 *   D10     Profile — GET|PATCH /v1/extension/profile ✅ complete
 *   D11     Capture — POST /v1/extension/applications ✅ this session (M19)
 *   D-cls   Classify— POST /v1/extension/classify    🔜 Resume Categories
 *
 * StorageModule is imported to inject StorageService into ExtensionProfileService
 * for R2 presigned download URL generation (1-hour TTL, resume PDF).
 *
 * ExtensionAuthService and ExtensionAuthGuard are exported so future
 * sub-controllers can protect their routes without re-declaring providers.
 *
 * AtsScorer is provided here via factory (plain class — no NestJS decorators).
 * It uses process.env['ANTHROPIC_API_KEY'] internally — already set in prod.
 */
@Module({
  imports:   [DatabaseModule, StorageModule],
  providers: [
    ExtensionAuthService,
    ExtensionAuthGuard,
    ExtensionScoreService,
    ExtensionProfileService,
    ExtensionCaptureService,
    {
      provide:    AtsScorer,
      useFactory: (): AtsScorer => new AtsScorer(),
    },
  ],
  controllers: [
    ExtensionAuthController,
    ExtensionScoreController,
    ExtensionProfileController,
    ExtensionCaptureController,
  ],
  exports: [ExtensionAuthService, ExtensionAuthGuard],
})
export class ExtensionModule {}
