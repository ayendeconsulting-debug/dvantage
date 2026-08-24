import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ALLOWED_RESUME_MIME_TYPES, RESUME_MAX_SIZE_BYTES } from '@vantage/validation';
import type { ParseResult } from './parse-result.interface';
import { PdfStrategy } from './strategies/pdf.strategy';
import { DocxStrategy } from './strategies/docx.strategy';
import { TxtStrategy } from './strategies/txt.strategy';
import { VirusScanService } from './virus-scan.service';

const MIN_WORD_COUNT = 20;

@Injectable()
export class ParsingService {
  private readonly logger = new Logger(ParsingService.name);
  private readonly blockOnUnknownScan: boolean;

  constructor(
    private readonly pdfStrategy: PdfStrategy,
    private readonly docxStrategy: DocxStrategy,
    private readonly txtStrategy: TxtStrategy,
    private readonly virusScan: VirusScanService,
  ) {
    this.blockOnUnknownScan = process.env['VIRUS_SCAN_BLOCK_UNKNOWN'] === 'true';
  }

  async parse(buffer: Buffer, mimeType: string, fileName: string): Promise<ParseResult> {
    // 1. MIME type
    const allowedMimes = ALLOWED_RESUME_MIME_TYPES as readonly string[];
    if (!allowedMimes.includes(mimeType)) {
      throw new UnprocessableEntityException(
        `Unsupported file type "${mimeType}". Allowed: ${ALLOWED_RESUME_MIME_TYPES.join(', ')}`,
      );
    }

    // 2. File size
    if (buffer.byteLength > RESUME_MAX_SIZE_BYTES) {
      throw new UnprocessableEntityException(
        `File size ${buffer.byteLength} bytes exceeds the maximum of ${RESUME_MAX_SIZE_BYTES} bytes.`,
      );
    }

    // 3. Virus scan
    const scanResult = await this.virusScan.scan(buffer, fileName);
    if (scanResult === 'infected') {
      this.logger.warn(`Infected file rejected: "${fileName}"`);
      throw new UnprocessableEntityException(
        'The uploaded file was rejected by the virus scanner.',
      );
    }
    if (scanResult === 'unknown' && this.blockOnUnknownScan) {
      this.logger.warn(`File "${fileName}" blocked — scan returned unknown`);
      throw new UnprocessableEntityException('The file could not be scanned. Upload rejected.');
    }

    // 4. Parse
    this.logger.log(`Parsing "${fileName}" (${mimeType}, ${buffer.byteLength} bytes)`);

    let result: ParseResult;
    switch (mimeType) {
      case 'application/pdf':
        result = await this.pdfStrategy.parse(buffer);
        break;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        result = await this.docxStrategy.parse(buffer);
        break;
      case 'text/plain':
        result = this.txtStrategy.parse(buffer);
        break;
      default:
        throw new UnprocessableEntityException(`No parsing strategy for "${mimeType}".`);
    }

    // 5. Minimum content check
    if (result.wordCount < MIN_WORD_COUNT) {
      throw new UnprocessableEntityException(
        `Extracted text too short (${result.wordCount} words). File may be empty or image-only.`,
      );
    }

    this.logger.log(
      `Parse complete — "${fileName}" words=${result.wordCount}` +
        (result.pageCount !== undefined ? ` pages=${result.pageCount}` : ''),
    );

    return result;
  }
}
