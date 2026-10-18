// ---------------------------------------------------------------------------
// ExtensionProfileController
//
// Mounted at /v1/extension (global prefix 'v1' set in main.ts).
//
// GET  /v1/extension/profile
//   Returns the autofill profile assembled from users + user_profiles + MRU resume.
//   The extension BG SW caches this for 5 minutes in chrome.storage.local.
//
// PATCH /v1/extension/profile
//   Persists phone + linkedinUrl to user_profiles, returns the full profile.
//   The extension replaces its cache with the returned value — no separate GET.
//
// Both routes: @Public() + ExtensionAuthGuard (Bearer token, not session cookie).
// ---------------------------------------------------------------------------

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ZodError } from 'zod';

import { Public } from '../auth/decorators/public.decorator';
import { CurrentExtensionToken, ExtensionAuthGuard } from './extension-auth.guard';
import type { ExtensionToken } from '@vantage/database';
import { ExtensionProfileService } from './extension-profile.service';
import {
  ExtensionProfileUpdateSchema,
  type ExtensionProfileResponseDto,
} from './dto/extension-profile.dto';

@Controller('extension')
@Public()
@UseGuards(ExtensionAuthGuard)
export class ExtensionProfileController {
  constructor(private readonly profileService: ExtensionProfileService) {}

  // ---------------------------------------------------------------------------
  // GET /v1/extension/profile
  // ---------------------------------------------------------------------------

  /**
   * Assemble and return the autofill profile.
   *
   * Three concurrent DB reads + one conditional R2 presign.
   * Response time: typically < 150 ms (no AI calls).
   *
   * The extension BG SW writes the response to chrome.storage.local[CACHED_PROFILE]
   * with a `cachedAt` timestamp. It re-fetches if the entry is older than 5 minutes.
   * On PATCH, the updated profile is returned and the BG SW overwrites the cache.
   */
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  async getProfile(
    @CurrentExtensionToken() token: ExtensionToken,
  ): Promise<ExtensionProfileResponseDto> {
    return this.profileService.getProfile(token);
  }

  // ---------------------------------------------------------------------------
  // PATCH /v1/extension/profile
  // ---------------------------------------------------------------------------

  /**
   * Upsert phone and/or LinkedIn URL in the user_profiles table.
   * Returns the full assembled profile so the extension cache is updated atomically.
   *
   * Fields not present in the request body are left unchanged.
   * Pass null to explicitly clear a field.
   */
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentExtensionToken() token: ExtensionToken,
    @Body() body: unknown,
  ): Promise<ExtensionProfileResponseDto> {
    let dto;
    try {
      dto = ExtensionProfileUpdateSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException(err.errors.map((e) => e.message).join('; '));
      }
      throw err;
    }

    return this.profileService.updateProfile(token, dto);
  }
}
