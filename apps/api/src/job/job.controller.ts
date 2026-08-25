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
  Patch,
  Post,
  Query,
  Res,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { JobService } from './job.service';
import { AtsScoreService } from './ats-score.service';
import { OptimizeService } from './optimize.service';
import { ResumePdfService } from '../resume/export/resume-pdf.service';
import { ResumeDocxService } from '../resume/export/resume-docx.service';
import { createJobDescriptionSchema, updateJobDescriptionSchema } from '@vantage/validation';

// ---------------------------------------------------------------------------
// Inline body schema for POST /v1/jobs/:id/scores
// ---------------------------------------------------------------------------

const createScoreBodySchema = z.object({
  resumeVersionId: z.string().uuid('resumeVersionId must be a valid UUID.'),
});

@Controller('jobs')
export class JobController {
  private readonly logger = new Logger(JobController.name);

  constructor(
    private readonly jobService: JobService,
    private readonly atsScoreService: AtsScoreService,
    private readonly optimizeService: OptimizeService,
    private readonly resumePdfService: ResumePdfService,
    private readonly resumeDocxService: ResumeDocxService,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /v1/jobs
  // ---------------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createJob(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    this.requireIdempotencyKey(idempotencyKey);
    const dto = this.parseBody(body, createJobDescriptionSchema);
    return this.jobService.createJob(user, dto);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/jobs
  // ---------------------------------------------------------------------------

  @Get()
  async listJobs(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.jobService.listJobs(user, cursor);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/jobs/:id
  // ---------------------------------------------------------------------------

  @Get(':id')
  async getJob(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobService.getJob(user, id);
  }

  // ---------------------------------------------------------------------------
  // PATCH /v1/jobs/:id
  // ---------------------------------------------------------------------------

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateJob(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parseBody(body, updateJobDescriptionSchema);
    return this.jobService.updateJob(user, id, dto);
  }

  // ---------------------------------------------------------------------------
  // DELETE /v1/jobs/:id
  // ---------------------------------------------------------------------------

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteJob(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobService.deleteJob(user, id);
  }

  // ---------------------------------------------------------------------------
  // POST /v1/jobs/:id/scores
  // ---------------------------------------------------------------------------

  @Post(':id/scores')
  @HttpCode(HttpStatus.ACCEPTED)
  async createScore(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.requireIdempotencyKey(idempotencyKey);
    const dto = this.parseBody(body, createScoreBodySchema);
    return this.atsScoreService.createScore(user, id, dto.resumeVersionId);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/jobs/:id/scores
  // ---------------------------------------------------------------------------

  @Get(':id/scores')
  async listScores(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.atsScoreService.listScores(user, id);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/jobs/:id/scores/:scoreId
  // ---------------------------------------------------------------------------

  @Get(':id/scores/:scoreId')
  async getScore(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('scoreId') scoreId: string,
  ) {
    return this.atsScoreService.getScore(user, id, scoreId);
  }

  // ---------------------------------------------------------------------------
  // POST /v1/jobs/:id/scores/:scoreId/optimize
  // ---------------------------------------------------------------------------

  @Post(':id/scores/:scoreId/optimize')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestOptimization(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Param('scoreId') scoreId: string,
  ) {
    this.requireIdempotencyKey(idempotencyKey);
    return this.optimizeService.requestOptimization(user, id, scoreId);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/jobs/:id/scores/:scoreId/optimize
  // ---------------------------------------------------------------------------

  @Get(':id/scores/:scoreId/optimize')
  async getOptimization(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('scoreId') scoreId: string,
  ) {
    return this.optimizeService.getOptimization(user, id, scoreId);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/jobs/:id/scores/:scoreId/optimize/export/pdf
  // ---------------------------------------------------------------------------

  /**
   * Download the AI-optimized resume as a formatted PDF.
   * Returns 422 if optimization has not completed.
   */
  @Get(':id/scores/:scoreId/optimize/export/pdf')
  async exportOptimizedPdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('scoreId') scoreId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { optimizedData, contactName } = await this.optimizeService.getOptimizedDataForExport(
      user,
      id,
      scoreId,
    );

    const buffer = await this.resumePdfService.generate(optimizedData, contactName);
    const safeName = encodeURIComponent(contactName.replace(/\s+/g, '-')) + '-optimized';

    void reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${safeName}.pdf"`)
      .header('Content-Length', buffer.length)
      .send(buffer);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/jobs/:id/scores/:scoreId/optimize/export/docx
  // ---------------------------------------------------------------------------

  /**
   * Download the AI-optimized resume as a Word document.
   * Returns 422 if optimization has not completed.
   */
  @Get(':id/scores/:scoreId/optimize/export/docx')
  async exportOptimizedDocx(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('scoreId') scoreId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { optimizedData, contactName } = await this.optimizeService.getOptimizedDataForExport(
      user,
      id,
      scoreId,
    );

    const buffer = await this.resumeDocxService.generate(optimizedData, contactName);
    const safeName = encodeURIComponent(contactName.replace(/\s+/g, '-')) + '-optimized';
    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    void reply
      .header('Content-Type', mime)
      .header('Content-Disposition', `attachment; filename="${safeName}.docx"`)
      .header('Content-Length', buffer.length)
      .send(buffer);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private requireIdempotencyKey(key: string | undefined): void {
    if (!key || key.trim().length === 0) {
      throw new BadRequestException('Idempotency-Key header is required for this request.');
    }
  }

  private parseBody<T>(
    body: unknown,
    schema: {
      safeParse: (
        v: unknown,
      ) =>
        | { success: true; data: T }
        | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
    },
  ): T {
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    return result.data;
  }
}
