import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector }    from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY }             from '../decorators/public.decorator';
import { AUTH_USER_KEY, AUTH_SESSION_KEY } from '../decorators/current-user.decorator';
import { AuthService }               from '../auth.service';

/**
 * Global HTTP auth guard.
 *
 * - Skips @Public() routes.
 * - Validates the session cookie / Authorization header via better-auth.
 * - Attaches user + session to the request for @CurrentUser() / @CurrentSession().
 * - Returns 401 on any unauthenticated request.
 *
 * Register globally in AppModule:
 *   providers: [{ provide: APP_GUARD, useClass: AuthGuard }]
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector:   Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Honour @Public() on the handler or its class
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const result  = await this.authService.getSession(request);

    if (!result) {
      throw new UnauthorizedException('Invalid or expired session.');
    }

    // Attach for @CurrentUser() / @CurrentSession() decorators
    const req = request as unknown as Record<string, unknown>;
    req[AUTH_USER_KEY]    = result.user;
    req[AUTH_SESSION_KEY] = result.session;

    return true;
  }
}
