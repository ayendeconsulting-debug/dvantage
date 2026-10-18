import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerAiModule } from './worker-ai.module';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  // Standalone application context — no HTTP server, no Fastify adapter.
  // NestJS DI manages service lifetimes; BullMQ Workers handle the queue loop.
  const app = await NestFactory.createApplicationContext(WorkerAiModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  // Keep the process alive — BullMQ Workers run their own event loop internally.
  app.enableShutdownHooks();

  logger.log('worker-ai started — listening for jobs');
  logger.log(`Environment: ${process.env['NODE_ENV'] ?? 'development'}`);
}

void bootstrap().catch((err: unknown) => {
  // Use console here — Logger may not be initialised yet if bootstrap itself throws.
   
  console.error('[worker-ai] Fatal bootstrap error:', err);
  process.exit(1);
});
