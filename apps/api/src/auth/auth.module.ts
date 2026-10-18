import { Module, Inject, Logger, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import type { DatabaseClient } from '@vantage/database';

import { DatabaseModule, DATABASE_CLIENT } from '../database/database.module';
import { RedisModule, REDIS_CLIENT } from '../redis/redis.module';
import { KmsModule } from '../common/kms/kms.module';
import { KmsService } from '../common/kms/kms.service';
import { NotificationModule } from '../notification/notification.module';
import { NotificationService } from '../notification/notification.service';

import { AUTH_INSTANCE, createAuth, type AuthInstance } from './auth.config';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';

@Module({
  imports: [DatabaseModule, RedisModule, KmsModule, NotificationModule],
  providers: [
    {
      provide: AUTH_INSTANCE,
      inject: [DATABASE_CLIENT, REDIS_CLIENT, KmsService, NotificationService],
      useFactory: async (
        db: DatabaseClient,
        redis: Redis,
        kmsService: KmsService,
        notificationService: NotificationService,
      ): Promise<AuthInstance> =>
        createAuth({
          db,
          redis,
          env: {
            authSecret: process.env['AUTH_SECRET'] ?? '',
            apiUrl: process.env['API_URL'] ?? 'http://localhost:3001',
            appUrl: process.env['APP_URL'] ?? 'http://localhost:3000',
            googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
            googleClientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
            microsoftClientId: process.env['MICROSOFT_CLIENT_ID'] ?? '',
            microsoftClientSecret: process.env['MICROSOFT_CLIENT_SECRET'] ?? '',
          },
          encryptToken: (v) => kmsService.encrypt(v),
          sendVerificationEmail: (email, url) =>
            notificationService.sendVerificationEmail(email, url),
          sendPasswordResetEmail: (email, url) =>
            notificationService.sendPasswordResetEmail(email, url),
        }),
    },

    AuthService,
    AuthGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
    Reflector,
  ],
  exports: [AUTH_INSTANCE, AuthService, AuthGuard],
})
export class AuthModule implements OnModuleInit {
  private readonly logger = new Logger(AuthModule.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    @Inject(AUTH_INSTANCE) private readonly auth: AuthInstance,
  ) {}

  onModuleInit(): void {
    const fastify = this.httpAdapterHost.httpAdapter.getInstance<FastifyInstance>();

    // Fly.io terminates TLS at the edge and forwards requests internally as
    // plain HTTP. request.protocol is always 'http' — we must use API_URL to
    // reconstruct the correct https:// URL so better-auth's baseURL matches.
    const apiBase = process.env['API_URL'] ?? 'http://localhost:3001';

    fastify.all('/api/auth/*', async (request: FastifyRequest, reply: FastifyReply) => {
      const url = new URL(request.url, apiBase).toString();

      const reqHeaders = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (typeof value === 'string') reqHeaders.set(key, value);
        else if (Array.isArray(value)) value.forEach((v) => reqHeaders.append(key, v));
      }

      const hasBody = !['GET', 'HEAD'].includes(request.method.toUpperCase());
      const body = hasBody && request.body != null ? JSON.stringify(request.body) : undefined;

      const webRequest = new Request(url, {
        method: request.method,
        headers: reqHeaders,
        ...(body !== undefined ? { body } : {}),
      });

      let response: Response;
      try {
        response = await this.auth.handler(webRequest);
      } catch (err) {
        this.logger.error(`better-auth error: ${(err as Error).message}`, (err as Error).stack);
        return reply.status(500).send({ error: 'Internal server error' });
      }

      reply.status(response.status);

      // Forward all headers EXCEPT Set-Cookie.
      // Headers.entries() collapses multiple Set-Cookie values into one
      // comma-separated string — invalid per RFC 6265, causes ERR_INVALID_RESPONSE
      // in the browser when better-auth sets multiple cookies on OAuth redirect.
      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() === 'set-cookie') continue;
        void reply.header(key, value);
      }

      // Forward each Set-Cookie value as a separate header (Node 18+ API).
      type HeadersPlus = Headers & { getSetCookie?: () => string[] };
      const setCookieFn = (response.headers as HeadersPlus).getSetCookie;
      const cookies: string[] =
        typeof setCookieFn === 'function' ? setCookieFn.call(response.headers) : [];
      for (const cookie of cookies) {
        void reply.header('set-cookie', cookie);
      }

      return reply.send(Buffer.from(await response.arrayBuffer()));
    });

    this.logger.log('better-auth routes registered → /api/auth/*');
  }
}
