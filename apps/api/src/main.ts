/**
 * OTEL must be the very first import — before reflect-metadata,
 * before NestJS, before anything. It patches Node.js internals.
 */
import './otel';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, VersioningType } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  // -- Sentry ----------------------------------------------------------------
  const sentryDsn = process.env['SENTRY_DSN'];
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env['SENTRY_ENVIRONMENT'] ?? 'development',
      tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
    });
    logger.log('Sentry initialised');
  }

  // -- NestJS on Fastify -----------------------------------------------------
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger:     false,
      trustProxy: true,
    }),
    { bufferLogs: true },
  );

  // -- CORS ------------------------------------------------------------------
  const appUrl = process.env['APP_URL'] ?? 'http://localhost:3000';
  app.enableCors({
    origin: process.env['NODE_ENV'] === 'production'
      ? [appUrl]
      : [appUrl, 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
  });

  // -- API versioning --------------------------------------------------------
  app.enableVersioning({ type: VersioningType.URI });

  // -- Global prefix — /health and /stripe excluded -------------------------
  // /health  → load balancer probes (no /v1 prefix)
  // /stripe  → Stripe webhook (must not have /v1 prefix; also bypasses AuthGuard via @Public())
  app.setGlobalPrefix('v1', { exclude: ['health', 'stripe/webhook'] });

  // -- Global filters --------------------------------------------------------
  app.useGlobalFilters(new AllExceptionsFilter());

  // -- Global interceptors ---------------------------------------------------
  app.useGlobalInterceptors(new RequestIdInterceptor());

  // -- Swagger (non-production only) -----------------------------------------
  if (process.env['NODE_ENV'] !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Vantage API')
      .setDescription('AI Resume Intelligence & Autonomous Job Application Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .addServer(`http://localhost:${process.env['APP_PORT'] ?? 3001}`)
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
    });
    logger.log(`Swagger → http://localhost:${process.env['APP_PORT'] ?? 3001}/docs`);
  }

  // -- Graceful shutdown -----------------------------------------------------
  app.enableShutdownHooks();

  // -- Explicit init ---------------------------------------------------------
  // Must be called before mutating Fastify's content type parsers.
  // NestJS registers its own application/json parser during init().
  // We remove it and replace it with our raw-body-preserving version below.
  await app.init();

  // -- Raw body parser -------------------------------------------------------
  // Replaces Fastify's default JSON content type parser with one that stores
  // the raw Buffer on `request.rawBody` before parsing. Required for Stripe
  // webhook signature verification. Zero impact on all other routes — the
  // parsed JSON output is identical to the default parser.
  //
  // IMPORTANT: registered AFTER app.init() so NestJS's own parser is already
  // in place and can be cleanly removed first. Registering before init()
  // causes FST_ERR_CTP_ALREADY_PRESENT when NestJS tries to add its own.
  const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req: FastifyRequest, body: Buffer, done: (err: Error | null, body?: unknown) => void) => {
      (req as FastifyRequest & { rawBody: Buffer }).rawBody = body;
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (err) {
        done(err as Error);
      }
    },
  );

  // -- Listen — 0.0.0.0 required for Docker and Fly.io ----------------------
  const port = parseInt(process.env['APP_PORT'] ?? '3001', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`Vantage API → http://0.0.0.0:${port}`);
  logger.log(`Environment: ${process.env['NODE_ENV'] ?? 'development'}`);
}

void bootstrap();
