// ---------------------------------------------------------------------------
// ExtensionScoreController
//
// Mounted at /v1/extension (global prefix 'v1' set in main.ts).
//
// POST /v1/extension/score
//   @Public() + ExtensionAuthGuard — Bearer token from chrome.storage.local.
//   Body: { jobDescription: string; resumeId: string | null }
//   Response: { score, keywordGaps, semanticGaps, optimizationUrl }
//   Response time: ~3–8s (two synchronous Claude API calls via AtsScorer).
// ---------------------------------------------------------------------------

import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodError } from 'zod';

import { Public } from '../auth/decorators/public.decorator';
import { ExtensionAuthGuard, CurrentExtensionToken } from './extension-auth.guard';
import type { ExtensionToken } from '@vantage/database';
import { ExtensionScoreService } from './extension-score.service';
import { ExtensionScoreRequestSchema } from './dto/extension-score-request.dto';
import type { ExtensionScoreResponseDto } from './dto/extension-score-response.dto';

@Controller('extension')
@Public()
@UseGuards(ExtensionAuthGuard)
export class ExtensionScoreController {
  constructor(private readonly extensionScoreService: ExtensionScoreService) {}

  // ---------------------------------------------------------------------------
  // POST /v1/extension/score
  // ---------------------------------------------------------------------------

  /**
   * Synchronously score a job description against the user's resume.
   *
   * Protected by ExtensionAuthGuard — requires a valid, non-revoked
   * extension Bearer token in the Authorization header.
   *
   * The extension's background service worker calls this endpoint when
   * the user clicks "Score against my resume" in the side panel.
   * The 30s AbortController timeout in message-router.ts covers the
   * worst-case Claude API latency.
   *
   * Resume selection (server-side, never client-controlled):
   *   resumeId non-null → explicit version (future: from /classify)
   *   resumeId null     → MRU complete version for this user
   *
   * No DB write — scores are ephemeral. D13 handles application capture.
   */
  // Two synchronous Claude calls per request (AtsScorer runs extract-then-score).
  // The global 10/s + 200/min buckets are far too generous for an endpoint that
  // spends real money on every hit, so this route gets its own ceiling:
  // 6 per minute is well above any human clicking "Score" and well below
  // anything that could run up a bill.
  //
  // This is the request-rate ceiling. The monthly entitlement cap is enforced
  // separately in ExtensionScoreService via assertCanScore/recordUsage —
  // throttling limits burst, quota limits total. Both are needed.
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('score')
  @HttpCode(HttpStatus.OK)
  async score(
    @CurrentExtensionToken() token: ExtensionToken,
    @Body() body: unknown,
  ): Promise<ExtensionScoreResponseDto> {
    let dto;
    try {
      dto = ExtensionScoreRequestSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException(err.errors.map((e) => e.message).join('; '));
      }
      throw err;
    }

    return this.extensionScoreService.score(token, dto);
  }
}
