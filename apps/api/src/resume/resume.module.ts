import { Module } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { ResumeController } from './resume.controller';
import { ResumePdfService } from './export/resume-pdf.service';
import { ResumeDocxService } from './export/resume-docx.service';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';

/**
 * ResumeModule
 *
 * Owns all resume upload, parse status tracking, version management,
 * and export (PDF + DOCX) functionality.
 */
@Module({
  imports: [DatabaseModule, StorageModule],
  providers: [ResumeService, ResumePdfService, ResumeDocxService],
  controllers: [ResumeController],
})
export class ResumeModule {}
