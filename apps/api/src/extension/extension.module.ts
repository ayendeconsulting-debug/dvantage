import { Module } from '@nestjs/common';
import { DatabaseModule }         from '../database/database.module';
import { ExtensionAuthService }   from './extension-auth.service';
import { ExtensionAuthGuard }     from './extension-auth.guard';
import { ExtensionAuthController } from './extension-auth.controller';

/**
 * ExtensionModule
 *
 * Owns all Chrome extension API surface (/v1/extension/*).
 *
 * Phase 2 milestone map:
 *   D2–D4  Auth   — exchange / refresh / revoke  ← this module
 *   D5     Profile — GET /v1/extension/profile
 *   D9     Score  — POST /v1/extension/score
 *   D13    Capture — POST /v1/extension/applications
 *
 * ExtensionAuthService and ExtensionAuthGuard are exported so future
 * sub-controllers (profile, score, capture) can protect their routes
 * without re-declaring the guard as a provider.
 */
@Module({
  imports:     [DatabaseModule],
  providers:   [ExtensionAuthService, ExtensionAuthGuard],
  controllers: [ExtensionAuthController],
  exports:     [ExtensionAuthService, ExtensionAuthGuard],
})
export class ExtensionModule {}
