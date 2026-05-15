import { Injectable, Logger } from '@nestjs/common';
import type { ParseResult } from '../parse-result.interface';

@Injectable()
export class TxtStrategy {
  private readonly logger = new Logger(TxtStrategy.name);

  parse(buffer: Buffer): ParseResult {
    const rawText = this.normalise(buffer.toString('utf-8'));
    const wordCount = this.countWords(rawText);

    this.logger.debug(`TXT parsed — words=${wordCount}`);

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
