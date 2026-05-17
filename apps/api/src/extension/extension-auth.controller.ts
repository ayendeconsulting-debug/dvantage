// ---------------------------------------------------------------------------
// ExtensionAuthController
//
// Mounted at /v1/extension/auth (global prefix 'v1' set in main.ts).
//
// Route protection model:
//   POST /exchange        — global session AuthGuard (user must be logged into web app)
//   POST /refresh         — @Public() + ExtensionAuthGuard (Bearer token)
//   POST /revoke          — @Public() + ExtensionAuthGuard (Bearer token)
//   POST /revoke-session  — global session AuthGuard (web app signs out → revokes all tokens)
//   GET  /profile         — @Public() + ExtensionAuthGuard (Bearer token)
//
// Without @Public(), the global AuthGuard runs first and rejects requests that
// lack a session cookie — even with a valid Bearer token. @Public() bypasses
// the session check; ExtensionAuthGuard then validates the Bearer token.
// ---------------------------------------------------------------------------

import {
  Controller,
  Get,
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
  UserProfileDto,
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
  // Revokes the current device token (called from the extension sign-out button).
  // Subsequent requests with this token return 401. The extension clears
  // chrome.storage.local on receipt. Also callable from /settings/devices (D14).
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

  // ---------------------------------------------------------------------------
  // POST /v1/extension/auth/revoke-session
  //
  // Revokes ALL active extension tokens for the currently signed-in web user.
  // Called fire-and-forget from sidebar.tsx and mobile-drawer.tsx immediately
  // before better-auth's signOut(). Uses the existing web session cookie —
  // no Bearer token required or accepted on this route.
  //
  // Design rationale:
  //   The web app does not hold a Bearer token — it holds a session cookie.
  //   The existing /revoke route requires a Bearer token (ExtensionAuthGuard).
  //   This route uses the global session AuthGuard to identify the user, then
  //   revokes all their active extension tokens in one DB write.
  //
  //   Non-blocking from the caller's perspective: sidebar calls this then
  //   immediately calls signOut() without awaiting. If the network fails,
  //   the token expires naturally after 30 days. This is acceptable because
  //   the token is also invalidated on the next authenticated request via
  //   ExtensionAuthGuard (it will find no valid session for the user).
  // ---------------------------------------------------------------------------

  @Post('revoke-session')
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @CurrentUser() user: AuthUser,
  ): Promise<ExtensionAuthAckDto> {
    await this.extensionAuthService.revokeAllForUser(user.id);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // GET /v1/extension/auth/profile
  //
  // Returns the authenticated user's display name, email, and subscription plan.
  // Called by the extension's ProfilePanel on mount (stale-while-revalidate).
  // The cached result is stored in chrome.storage.local[USER_PROFILE] and
  // refreshed in the background on every side-panel open.
  //
  // plan defaults to 'free' when no subscription row exists for the user.
  // ---------------------------------------------------------------------------

  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(ExtensionAuthGuard)
  async getProfile(
    @CurrentExtensionToken() token: ExtensionToken,
  ): Promise<UserProfileDto> {
    return this.extensionAuthService.getProfile(token);
  }
}
