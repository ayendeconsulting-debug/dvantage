import { Module } from '@nestjs/common';
import { ApplicationController } from './application.controller';
import { ApplicationService }    from './application.service';
import { DatabaseModule }        from '../database/database.module';

/**
 * ApplicationModule
 *
 * Owns manual job application tracking (M5-D).
 * Full CRUD: POST/GET/GET/:id/PATCH/:id/DELETE/:id /v1/applications
 */
@Module({
  imports:     [DatabaseModule],
  controllers: [ApplicationController],
  providers:   [ApplicationService],
})
export class ApplicationModule {}
