import { Injectable, Logger } from '@nestjs/common';

export type VirusScanResult = 'clean' | 'infected' | 'unknown';

@Injectable()
export class VirusScanService {
  private readonly logger = new Logger(VirusScanService.name);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async scan(_buffer: Buffer, fileName: string): Promise<VirusScanResult> {
    this.logger.debug(
      `Virus scan stub invoked for "${fileName}" — returning 'unknown' (no vendor configured)`,
    );
    return 'unknown';
  }
}
