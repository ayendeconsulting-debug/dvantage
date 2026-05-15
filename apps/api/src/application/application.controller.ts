import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Logger,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { ApplicationService } from './application.service';
import { createApplicationSchema } from './dto/create-application.dto';
import { updateApplicationSchema } from './dto/update-application.dto';

@Controller('applications')
export class ApplicationController {
  private readonly logger = new Logger(ApplicationController.name);

  constructor(private readonly applicationService: ApplicationService) {}

  // ---------------------------------------------------------------------------
  // POST /v1/applications
  // ---------------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const result = createApplicationSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    }
    return this.applicationService.create(user, result.data);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/applications
  // ---------------------------------------------------------------------------

  /**
   * List all applications for the authenticated user.
   * Optional query params:
   *   ?status=applied|screening|interview|offer|rejected|withdrawn
   *   ?cursor=<ISO timestamp of last item's createdAt>
   */
  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.applicationService.list(user, status, cursor);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/applications/:id
  // ---------------------------------------------------------------------------

  @Get(':id')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.applicationService.get(user, id);
  }

  // ---------------------------------------------------------------------------
  // PATCH /v1/applications/:id
  // ---------------------------------------------------------------------------

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const result = updateApplicationSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    }
    return this.applicationService.update(user, id, result.data);
  }

  // ---------------------------------------------------------------------------
  // DELETE /v1/applications/:id
  // ---------------------------------------------------------------------------

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.applicationService.remove(user, id);
  }
}
