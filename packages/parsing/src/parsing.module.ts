import { Module } from '@nestjs/common';
import { ParsingService } from './parsing.service';
import { PdfStrategy } from './strategies/pdf.strategy';
import { DocxStrategy } from './strategies/docx.strategy';
import { TxtStrategy } from './strategies/txt.strategy';
import { VirusScanService } from './virus-scan.service';

@Module({
  providers: [ParsingService, PdfStrategy, DocxStrategy, TxtStrategy, VirusScanService],
  exports: [ParsingService],
})
export class ParsingModule {}
