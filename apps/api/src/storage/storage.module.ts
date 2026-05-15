import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * StorageModule
 *
 * Provides StorageService for presigned URL generation and object management
 * against the configured S3-compatible backend (MinIO in dev, Cloudflare R2 in prod).
 *
 * Import into any module that needs to read from or write to object storage.
 * ConfigModule must be globally registered (it is, in AppModule) for
 * StorageService to resolve its constructor deps.
 */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
