// ---------------------------------------------------------------------------
// ExtensionAuthController
//
// Mounted at /v1/extension/auth (global prefix 'v1' set in main.ts).
//
// Route protection model:
//   POST /exchange — global session AuthGuard (user must be logged into web app)
//   POST /refresh  — @Public() + ExtensionAuthGuard (Bearer token)
//   POST /revoke   — @Public() + ExtensionAuthGuard (Bearer token)
//
// The global AuthGuard runs first on every request. @Public() signals it to
// pass through without a session check; ExtensionAuthGuard then validates the
// Bearer token. Without @Public(), both guards would run — rejecting any
// request that lacks a session cookie, even with a valid Bearer token.
// ---------------------------------------------------------------------------

import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public }                    from '../auth/decorators/public.decorator';
import { CurrentUser }               from '../auth/decorators/current-user.decorator';
import type { AuthUser }             from '../auth/auth.service';
import type { ExtensionToken }       from '@vantage/database';
import { ExtensionAuthService }      from './extension-auth.service';
import { ExtensionAuthGuard, CurrentExtensionToken } from './extension-auth.guard';
import type {
  ExchangeResponseDto,
  ExtensionAuthAckDto,
} from './dto/extension-auth-response.dto';

@Controller('extension/auth')
export class ExtensionAuthController {
  constructor(private readonly extensionAuthService: ExtensionAuthService) {}

  // ---------------------------------------------------------------------------
  // POST /v1/extension/auth/exchange
  //
  // Called by the web app's /extension/auth callback page after user auth.
  // Mints a new 30-day extension token. Raw token returned ONCE — the client
  // must store it in chrome.storage.local[STORAGE_KEYS.EXTENSION_TOKEN].
  //
  // Protected by global session AuthGuard — user must have a valid session.
  // ---------------------------------------------------------------------------

  @Post('exchange')
  @HttpCode(HttpStatus.CREATED)
  async exchange(
    @CurrentUser() user: AuthUser,
    @Headers('user-agent') userAgent?: string,
  ): Promise<ExchangeResponseDto> {
    return this.extensionAuthService.exchange(user, userAgent);
  }

  // ---------------------------------------------------------------------------
  // POST /v1/extension/auth/refresh
  //
  // Slides the 30-day window. Called by the extension's background service
  // worker on a periodic schedule (e.g. daily). The actual last_seen_at update
  // is handled as fire-and-forget inside ExtensionAuthGuard to avoid latency.
  // ---------------------------------------------------------------------------

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(ExtensionAuthGuard)
  async refresh(
    @CurrentExtensionToken() _token: ExtensionToken,
  ): Promise<ExtensionAuthAckDto> {
    // last_seen_at slide is performed fire-and-forget in ExtensionAuthGuard.
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // POST /v1/extension/auth/revoke
  //
  // Revokes the current device token. Subsequent requests with this token
  // return 401. The extension must clear chrome.storage.local on receipt.
  // Also called from the web app's /settings/devices page (D14).
  // ---------------------------------------------------------------------------

  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(ExtensionAuthGuard)
  async revoke(
    @CurrentExtensionToken() token: ExtensionToken,
  ): Promise<ExtensionAuthAckDto> {
    await this.extensionAuthService.revoke(token);
    return { ok: true };
  }
}
