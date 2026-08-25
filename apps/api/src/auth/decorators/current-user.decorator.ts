import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthUser, AuthSession } from '../auth.service';

// Internal keys used by AuthGuard to attach auth data to the request
export const AUTH_USER_KEY = '_authUser';
export const AUTH_SESSION_KEY = '_authSession';

/**
 * Injects the authenticated user into a route handler parameter.
 * Requires AuthGuard to be active on the route.
 *
 * @example
 * @Get('/me')
 * getMe(@CurrentUser() user: AuthUser) { return user; }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    return (req as unknown as Record<string, unknown>)[AUTH_USER_KEY] as AuthUser | undefined;
  },
);

/**
 * Injects the current session into a route handler parameter.
 * Requires AuthGuard to be active on the route.
 */
export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthSession | undefined => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    return (req as unknown as Record<string, unknown>)[AUTH_SESSION_KEY] as AuthSession | undefined;
  },
);
