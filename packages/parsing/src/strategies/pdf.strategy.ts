import { Injectable, Logger } from '@nestjs/common';
import type { ParseResult } from '../parse-result.interface';

@Injectable()
export class PdfStrategy {
  private readonly logger = new Logger(PdfStrategy.name);

  async parse(buffer: Buffer): Promise<ParseResult> {
    // pdf-parse is a CommonJS module — require() is correct in CJS workspace.
     
    const pdfParse = require('pdf-parse') as (
      buffer: Buffer,
      options?: Record<string, unknown>,
    ) => Promise<{ text: string; numpages: number }>;

    const result = await pdfParse(buffer, { max: 0 });

    const rawText = this.normalise(result.text);
    const wordCount = this.countWords(rawText);

    this.logger.debug(`PDF parsed — pages=${result.numpages} words=${wordCount}`);

    return { rawText, wordCount, pageCount: result.numpages };
  }

  private normalise(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }
}
