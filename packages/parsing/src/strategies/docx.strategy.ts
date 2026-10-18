import { Injectable, Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import type { ParseResult } from '../parse-result.interface';

@Injectable()
export class DocxStrategy {
  private readonly logger = new Logger(DocxStrategy.name);

  async parse(buffer: Buffer): Promise<ParseResult> {
    const result = await mammoth.extractRawText({ buffer });

    if (result.messages.length > 0) {
      this.logger.debug(`DOCX parse warnings: ${result.messages.map((m) => m.message).join('; ')}`);
    }

    const rawText = this.normalise(result.value);
    const wordCount = this.countWords(rawText);

    this.logger.debug(`DOCX parsed — words=${wordCount}`);

    return { rawText, wordCount };
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
