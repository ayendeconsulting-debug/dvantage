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
  RefreshResponseDto,
  ExtensionAuthAckDto,
} from './dto/extension-auth-response.dto';

@Controller('extension/auth')
export class ExtensionAuthController {
  constructor(private readonly extensionAuthService: ExtensionAuthService) {}

  // ---------------------------------------------------------------------------
  // POST /v1/extension/auth/exchange
  //
  // Called by the extension's BG SW via tabs.onUpdated after the user lands
  // on /extension/done. The BG SW uses credentials:'include' — the session
  // cookie is forwarded automatically. Mints a new 30-day extension token.
  // Raw token returned ONCE — stored immediately in chrome.storage.local.
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
  // Slides the 30-day window and returns the new expiresAt. Called by the
  // extension's BG SW when AuthGate detects the token is within 7 days of
  // expiry. The extension updates TOKEN_EXPIRES_AT in chrome.storage.local
  // using the server-returned value — the server is the authoritative clock.
  //
  // last_seen_at slide is also performed fire-and-forget in ExtensionAuthGuard
  // on every authenticated request; the explicit update here is belt-and-
  // suspenders and returns the authoritative new window start time.
  // ---------------------------------------------------------------------------

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(ExtensionAuthGuard)
  async refresh(
    @CurrentExtensionToken() token: ExtensionToken,
  ): Promise<RefreshResponseDto> {
    return this.extensionAuthService.refresh(token);
  }

  // ---------------------------------------------------------------------------
  // POST /v1/extension/auth/revoke
  //
  // Revokes the current device token. Subsequent requests with this token
  // return 401. The extension clears chrome.storage.local on receipt.
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
