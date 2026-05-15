import {
  Module,
  Inject,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { APP_GUARD }       from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { Reflector }       from '@nestjs/core';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis }      from 'ioredis';
import type { DatabaseClient } from '@vantage/database';

import { DatabaseModule, DATABASE_CLIENT } from '../database/database.module';
import { RedisModule, REDIS_CLIENT }       from '../redis/redis.module';
import { KmsModule }                       from '../common/kms/kms.module';
import { KmsService }                      from '../common/kms/kms.service';
import { NotificationModule }              from '../notification/notification.module';
import { NotificationService }             from '../notification/notification.service';

import {
  AUTH_INSTANCE,
  createAuth,
  type AuthInstance,
} from './auth.config';
import { AuthService } from './auth.service';
import { AuthGuard }   from './guards/auth.guard';

@Module({
  imports: [DatabaseModule, RedisModule, KmsModule, NotificationModule],
  providers: [
    // -- better-auth instance (async factory — createAuth loads ESM via import()) --
    {
      provide:    AUTH_INSTANCE,
      inject:     [DATABASE_CLIENT, REDIS_CLIENT, KmsService, NotificationService],
      useFactory: async (
        db:                  DatabaseClient,
        redis:               Redis,
        kmsService:          KmsService,
        notificationService: NotificationService,
      ): Promise<AuthInstance> =>
        createAuth({
          db,
          redis,
          env: {
            authSecret:            process.env['AUTH_SECRET']             ?? '',
            apiUrl:                process.env['API_URL']                 ?? 'http://localhost:3001',
            appUrl:                process.env['APP_URL']                 ?? 'http://localhost:3000',
            googleClientId:        process.env['GOOGLE_CLIENT_ID']        ?? '',
            googleClientSecret:    process.env['GOOGLE_CLIENT_SECRET']    ?? '',
            microsoftClientId:     process.env['MICROSOFT_CLIENT_ID']     ?? '',
            microsoftClientSecret: process.env['MICROSOFT_CLIENT_SECRET'] ?? '',
          },
          encryptToken:           (v) => kmsService.encrypt(v),
          sendVerificationEmail:  (email, url) =>
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
    const fastify = this.httpAdapterHost.httpAdapter
      .getInstance<FastifyInstance>();

    // ---------------------------------------------------------------------------
    // IMPORTANT: Fly.io terminates TLS at the edge and forwards requests
    // internally as plain HTTP. This means request.protocol is always 'http'
    // regardless of the external scheme. We must use the API_URL env var
    // (which is the public-facing URL) as the base to reconstruct the correct
    // URL — otherwise better-auth's baseURL ('https://...') won't match the
    // reconstructed request URL ('http://...') and OAuth state lookups fail.
    // ---------------------------------------------------------------------------
    const apiBase = process.env['API_URL'] ?? 'http://localhost:3001';

    fastify.all('/api/auth/*', async (request: FastifyRequest, reply: FastifyReply) => {
      // Reconstruct the full URL using the public API base — not request.protocol
      // which is always 'http' behind Fly.io's TLS-terminating proxy.
      const url = new URL(request.url, apiBase).toString();

      const reqHeaders = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (typeof value === 'string')  reqHeaders.set(key, value);
        else if (Array.isArray(value))  value.forEach((v) => reqHeaders.append(key, v));
      }

      const hasBody    = !['GET', 'HEAD'].includes(request.method.toUpperCase());
      const body       = hasBody && request.body != null
        ? JSON.stringify(request.body)
        : undefined;

      const webRequest = new Request(url, {
        method:  request.method,
        headers: reqHeaders,
        ...(body !== undefined ? { body } : {}),
      });

      let response: Response;
      try {
        response = await this.auth.handler(webRequest);
      } catch (err) {
        this.logger.error(
          `better-auth error: ${(err as Error).message}`,
          (err as Error).stack,
        );
        return reply.status(500).send({ error: 'Internal server error' });
      }

      reply.status(response.status);
      for (const [key, value] of response.headers.entries()) {
        void reply.header(key, value);
      }

      return reply.send(Buffer.from(await response.arrayBuffer()));
    });

    this.logger.log('better-auth routes registered → /api/auth/*');
  }
}
