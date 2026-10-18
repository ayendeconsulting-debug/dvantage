import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { ResumeService } from './resume.service';
import { ResumePdfService } from './export/resume-pdf.service';
import { ResumeDocxService } from './export/resume-docx.service';
import { StorageService } from '../storage/storage.service';
import { uploadUrlRequestSchema } from './dto/upload-url-request.dto';

// Extend FastifyRequest to include multipart method added by @fastify/multipart
type MultipartRequest = FastifyRequest & {
  file: () => Promise<
    | {
        filename: string;
        mimetype: string;
        file: NodeJS.ReadableStream;
      }
    | undefined
  >;
};

@Controller('resumes')
export class ResumeController {
  private readonly logger = new Logger(ResumeController.name);

  constructor(
    private readonly resumeService: ResumeService,
    private readonly resumePdfService: ResumePdfService,
    private readonly resumeDocxService: ResumeDocxService,
    private readonly storageService: StorageService,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /v1/resumes/upload  — proxy upload (browser → API → R2)
  // ---------------------------------------------------------------------------

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  async proxyUpload(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: MultipartRequest,
  ) {
    this.requireIdempotencyKey(idempotencyKey);

    const part = await req.file();
    if (!part) {
      throw new BadRequestException('No file found in request. Use field name "file".');
    }

    const { filename, mimetype, file: fileStream } = part;

    if (!this.storageService.isAllowedMimeType(mimetype)) {
      fileStream.resume();
      throw new BadRequestException(`Unsupported file type: ${mimetype}. Allowed: PDF, DOCX, TXT.`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    const buffer = Buffer.concat(chunks);
    const sizeBytes = buffer.length;

    if (sizeBytes > this.storageService.maxFileSizeBytes) {
      throw new BadRequestException(
        `File too large: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB. Maximum: 10 MB.`,
      );
    }

    const dto = {
      filename,
      mimeType: mimetype as
        | 'application/pdf'
        | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        | 'text/plain',
      sizeBytes,
    };
    const { resumeVersionId, storageKey } = await this.resumeService.createUploadUrlWithKey(
      user,
      dto,
    );

    await this.storageService.putObject(storageKey, buffer, mimetype);

    return this.resumeService.confirmUpload(user, resumeVersionId);
  }

  // ---------------------------------------------------------------------------
  // POST /v1/resumes/upload-url
  // ---------------------------------------------------------------------------

  @Post('upload-url')
  @HttpCode(HttpStatus.CREATED)
  async createUploadUrl(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    this.requireIdempotencyKey(idempotencyKey);
    const dto = this.parseBody(body);
    return this.resumeService.createUploadUrl(user, dto);
  }

  // ---------------------------------------------------------------------------
  // POST /v1/resumes/:id/confirm
  // ---------------------------------------------------------------------------

  @Post(':id/confirm')
  @HttpCode(HttpStatus.ACCEPTED)
  async confirmUpload(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
  ) {
    this.requireIdempotencyKey(idempotencyKey);
    return this.resumeService.confirmUpload(user, id);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/resumes
  // ---------------------------------------------------------------------------

  @Get()
  async listVersions(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.resumeService.listVersions(user, cursor);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/resumes/:id
  // ---------------------------------------------------------------------------

  @Get(':id')
  async getVersion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.resumeService.getVersion(user, id);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/resumes/:id/optimizations
  // ---------------------------------------------------------------------------

  /**
   * Returns all completed optimizations that used this resume version,
   * ordered most-recent first. Each item includes enough context
   * (job title, company, date) to label a dropdown option in the UI.
   */
  @Get(':id/optimizations')
  async listOptimizations(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.resumeService.listOptimizationsForVersion(user, id);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/resumes/:id/export/pdf
  // ---------------------------------------------------------------------------

  @Get(':id/export/pdf')
  async exportPdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { structuredData, fileName } = await this.resumeService.getVersionForExport(user, id);

    const buffer = await this.resumePdfService.generate(structuredData, fileName);
    const baseName = encodeURIComponent(fileName.replace(/\.[^.]+$/, ''));

    void reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${baseName}.pdf"`)
      .header('Content-Length', buffer.length)
      .send(buffer);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/resumes/:id/export/docx
  // ---------------------------------------------------------------------------

  @Get(':id/export/docx')
  async exportDocx(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { structuredData, fileName } = await this.resumeService.getVersionForExport(user, id);

    const buffer = await this.resumeDocxService.generate(structuredData, fileName);
    const baseName = encodeURIComponent(fileName.replace(/\.[^.]+$/, ''));
    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    void reply
      .header('Content-Type', mime)
      .header('Content-Disposition', `attachment; filename="${baseName}.docx"`)
      .header('Content-Length', buffer.length)
      .send(buffer);
  }

  // ---------------------------------------------------------------------------
  // DELETE /v1/resumes/:id
  // ---------------------------------------------------------------------------

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteVersion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.resumeService.deleteVersion(user, id);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private requireIdempotencyKey(key: string | undefined): void {
    if (!key || key.trim().length === 0) {
      throw new BadRequestException('Idempotency-Key header is required for this request.');
    }
  }

  private parseBody(body: unknown) {
    const result = uploadUrlRequestSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    return result.data;
  }
}
