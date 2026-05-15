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
  Res,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { ResumeService } from './resume.service';
import { ResumePdfService } from './export/resume-pdf.service';
import { ResumeDocxService } from './export/resume-docx.service';
import { uploadUrlRequestSchema } from './dto/upload-url-request.dto';

@Controller('resumes')
export class ResumeController {
  private readonly logger = new Logger(ResumeController.name);

  constructor(
    private readonly resumeService: ResumeService,
    private readonly resumePdfService: ResumePdfService,
    private readonly resumeDocxService: ResumeDocxService,
  ) {}

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
  async listVersions(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
  ) {
    return this.resumeService.listVersions(user, cursor);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/resumes/:id
  // ---------------------------------------------------------------------------

  @Get(':id')
  async getVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.resumeService.getVersion(user, id);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/resumes/:id/export/pdf
  // ---------------------------------------------------------------------------

  /**
   * Generate and download a PDF of the resume's AI-extracted structured data.
   * Returns 422 if the resume has not completed parsing.
   */
  @Get(':id/export/pdf')
  async exportPdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { structuredData, fileName } =
      await this.resumeService.getVersionForExport(user, id);

    const buffer = await this.resumePdfService.generate(structuredData, fileName);

    // Strip extension from filename — we append the correct one
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

  /**
   * Generate and download a Word document of the resume's AI-extracted structured data.
   * Returns 422 if the resume has not completed parsing.
   */
  @Get(':id/export/docx')
  async exportDocx(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { structuredData, fileName } =
      await this.resumeService.getVersionForExport(user, id);

    const buffer = await this.resumeDocxService.generate(structuredData, fileName);

    const baseName = encodeURIComponent(fileName.replace(/\.[^.]+$/, ''));
    const mime =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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
  async deleteVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.resumeService.deleteVersion(user, id);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private requireIdempotencyKey(key: string | undefined): void {
    if (!key || key.trim().length === 0) {
      throw new BadRequestException(
        'Idempotency-Key header is required for this request.',
      );
    }
  }

  private parseBody(body: unknown) {
    const result = uploadUrlRequestSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    }
    return result.data;
  }
}
