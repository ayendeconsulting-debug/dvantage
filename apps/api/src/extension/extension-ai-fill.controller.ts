// ---------------------------------------------------------------------------
// ExtensionAiFillController
//
// POST /v1/extension/ai-fill
//   Generates AI-powered answers for job application form fields that the
//   deterministic autofill engine (Tier A) could not fill from the user profile.
//   Auth: Bearer extension token (@Public + ExtensionAuthGuard).
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
import { CurrentExtensionToken, ExtensionAuthGuard } from './extension-auth.guard';
import type { ExtensionToken } from '@vantage/database';
import { ExtensionAiFillService } from './extension-ai-fill.service';
import { AiFillRequestSchema } from './dto/ai-fill.dto';

@Controller('extension')
@Public()
@UseGuards(ExtensionAuthGuard)
export class ExtensionAiFillController {
  constructor(private readonly aiFillService: ExtensionAiFillService) {}

  /**
   * POST /v1/extension/ai-fill
   *
   * The extension sends fields that Tier A autofill skipped (profile value was
   * null/empty). Claude reads the user's resume and generates answers for each
   * field. Returns null for fields where the resume lacks sufficient context.
   *
   * 200 OK on success (answers may contain nulls).
   * 400 Bad Request on invalid payload.
   * 422 Unprocessable Entity when no complete resume exists.
   */
  // One Claude call per request, carrying the full resume JSON. A user filling
  // a form clicks this once, maybe twice on retry — 10/min is generous for the
  // real workflow and closes the unbounded-loop case.
  //
  // A per-user daily ceiling is enforced separately in ExtensionAiFillService
  // (Redis counter), because throttling is per-IP and a determined caller can
  // change IP; the daily cap follows the account.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('ai-fill')
  @HttpCode(HttpStatus.OK)
  async fill(@CurrentExtensionToken() token: ExtensionToken, @Body() body: unknown) {
    let dto;
    try {
      dto = AiFillRequestSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException(err.errors.map((e) => e.message).join('; '));
      }
      throw err;
    }

    return this.aiFillService.fill(token, dto);
  }
}
