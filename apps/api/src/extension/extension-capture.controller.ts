// ---------------------------------------------------------------------------
// ExtensionCaptureController
//
// Mounted at /v1/extension (global prefix 'v1' set in main.ts).
//
// POST /v1/extension/applications
//   Records an application capture after the extension autofills a job form.
//   Authenticated via Bearer extension token (@Public + ExtensionAuthGuard).
//   Returns the inserted application summary (id, company, role, status, date).
//   Idempotency: not enforced at MVP — duplicate autofills create duplicate rows.
//   Future: deduplicate by (userId, pageUrl, appliedDate) if needed.
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
import { ZodError } from 'zod';

import { Public } from '../auth/decorators/public.decorator';
import { CurrentExtensionToken, ExtensionAuthGuard } from './extension-auth.guard';
import type { ExtensionToken } from '@vantage/database';
import { ExtensionCaptureService } from './extension-capture.service';
import {
  CaptureApplicationSchema,
  type CaptureApplicationResponseDto,
} from './dto/capture-application.dto';

@Controller('extension')
@Public()
@UseGuards(ExtensionAuthGuard)
export class ExtensionCaptureController {
  constructor(private readonly captureService: ExtensionCaptureService) {}

  // ---------------------------------------------------------------------------
  // POST /v1/extension/applications
  // ---------------------------------------------------------------------------

  /**
   * Record an application captured by the autofill engine.
   *
   * The extension fires this immediately after a successful autofill, before
   * the user has submitted the application. Status is set to 'applied' — the
   * intent is to capture the act of filling out and (likely) submitting.
   *
   * 201 Created on success. 400 Bad Request if payload fails Zod validation.
   */
  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  async capture(
    @CurrentExtensionToken() token: ExtensionToken,
    @Body() body: unknown,
  ): Promise<CaptureApplicationResponseDto> {
    let dto;
    try {
      dto = CaptureApplicationSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException(err.errors.map((e) => e.message).join('; '));
      }
      throw err;
    }

    return this.captureService.capture(token, dto);
  }
}
