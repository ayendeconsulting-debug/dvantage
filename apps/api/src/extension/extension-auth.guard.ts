// ---------------------------------------------------------------------------
// ExtensionAuthGuard
//
// Route-level guard for extension Bearer token authentication.
// Paired with @Public() to bypass the global session-based AuthGuard.
//
// On every successful validation:
//   1. Token is attached to the request as EXTENSION_TOKEN_KEY
//   2. last_seen_at is updated (fire-and-forget — no added latency)
//
// Usage:
//   @Public()                        // bypass global AuthGuard
//   @UseGuards(ExtensionAuthGuard)   // validate Bearer token instead
//   @Post('/refresh')
//   async refresh(@CurrentExtensionToken() token: ExtensionToken) { ... }
// ---------------------------------------------------------------------------

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { ExtensionToken } from '@vantage/database';
import { ExtensionAuthService } from './extension-auth.service';

/** Request-scoped key under which the validated ExtensionToken is stored. */
export const EXTENSION_TOKEN_KEY = '_extensionToken';

/**
 * Injects the validated ExtensionToken row into a route handler parameter.
 * Requires ExtensionAuthGuard to be active on the route.
 *
 * @example
 * @Post('/revoke')
 * async revoke(@CurrentExtensionToken() token: ExtensionToken) { ... }
 */
export const CurrentExtensionToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ExtensionToken | undefined => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    return (req as unknown as Record<string, unknown>)[EXTENSION_TOKEN_KEY] as
      | ExtensionToken
      | undefined;
  },
);

@Injectable()
export class ExtensionAuthGuard implements CanActivate {
  constructor(private readonly extensionAuthService: ExtensionAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const rawToken = this.extractBearerToken(request);

    if (!rawToken) {
      throw new UnauthorizedException('Missing Authorization: Bearer token.');
    }

    const token = await this.extensionAuthService.validate(rawToken);

    if (!token) {
      throw new UnauthorizedException('Invalid or revoked extension token.');
    }

    // Slide the 30-day window on every authenticated request.
    // Fire-and-forget: DB latency must not block the response.
    void this.extensionAuthService.refresh(token);

    // Attach for @CurrentExtensionToken() downstream
    const req = request as unknown as Record<string, unknown>;
    req[EXTENSION_TOKEN_KEY] = token;

    return true;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private extractBearerToken(request: FastifyRequest): string | null {
    const auth = request.headers.authorization;
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7).trim();
    return token.length > 0 ? token : null;
  }
}
