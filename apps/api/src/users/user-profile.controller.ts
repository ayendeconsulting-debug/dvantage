// ---------------------------------------------------------------------------
// UserProfileController
//
// Web-app-facing profile endpoint. Uses the global AuthGuard (better-auth
// session cookie) — no @Public() override, no ExtensionAuthGuard.
//
// Routes:
//   GET  /v1/users/me/profile  → current phone + linkedinUrl
//   PATCH /v1/users/me/profile → upsert phone and/or linkedinUrl
// ---------------------------------------------------------------------------

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { UserProfileService } from './user-profile.service';
import { UpdateUserProfileSchema } from './dto/user-profile.dto';

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@Controller('users/me/profile')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  // ---------------------------------------------------------------------------
  // GET /v1/users/me/profile
  // ---------------------------------------------------------------------------

  @Get()
  async getProfile(@CurrentUser() user: AuthUser) {
    return this.userProfileService.getProfile(user);
  }

  // ---------------------------------------------------------------------------
  // PATCH /v1/users/me/profile
  // ---------------------------------------------------------------------------

  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateProfile(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const result = UpdateUserProfileSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }

    // Guard: at least one field must be provided
    if (result.data.phone === undefined && result.data.linkedinUrl === undefined) {
      throw new BadRequestException('At least one of phone or linkedinUrl must be provided.');
    }

    return this.userProfileService.updateProfile(user, result.data);
  }
}
