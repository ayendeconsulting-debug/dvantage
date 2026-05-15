import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'IS_PUBLIC';

/**
 * Mark a controller or route handler as publicly accessible.
 * Routes decorated with @Public() bypass the global AuthGuard.
 *
 * @example
 * @Public()
 * @Get('/status')
 * status() { return { ok: true }; }
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
