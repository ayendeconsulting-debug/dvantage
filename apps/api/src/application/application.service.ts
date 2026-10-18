import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gt } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { applications, type DatabaseClient, type ApplicationStatus } from '@vantage/database';
import type { AuthUser } from '../auth/auth.service';
import { DATABASE_CLIENT } from '../database/database.module';
import type { CreateApplicationDto } from './dto/create-application.dto';
import type { UpdateApplicationDto } from './dto/update-application.dto';
import type {
  ApplicationResponseDto,
  ApplicationListResponseDto,
} from './dto/application-response.dto';

const PAGE_SIZE = 50;

const VALID_STATUSES = new Set<ApplicationStatus>([
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
]);

@Injectable()
export class ApplicationService {
  private readonly logger = new Logger(ApplicationService.name);

  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // POST /v1/applications
  // ---------------------------------------------------------------------------

  async create(user: AuthUser, dto: CreateApplicationDto): Promise<ApplicationResponseDto> {
    const id = uuidv7();
    const now = new Date();

    await this.db.insert(applications).values({
      id,
      userId: user.id,
      jobDescriptionId: dto.jobDescriptionId ?? null,
      company: dto.company,
      role: dto.role,
      location: dto.location ?? null,
      status: dto.status ?? 'applied',
      appliedDate: dto.appliedDate,
      notes: dto.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });

    this.logger.log(`Application created — id=${id} user=${user.id} company=${dto.company}`);

    const row = await this.findOwned(user.id, id);
    return this.toDto(row);
  }

  // ---------------------------------------------------------------------------
  // GET /v1/applications
  // ---------------------------------------------------------------------------

  async list(
    user: AuthUser,
    status?: string,
    cursor?: string,
  ): Promise<ApplicationListResponseDto> {
    const validStatus: ApplicationStatus | undefined = VALID_STATUSES.has(
      status as ApplicationStatus,
    )
      ? (status as ApplicationStatus)
      : undefined;

    const cursorDate = cursor ? new Date(cursor) : undefined;

    const rows = await this.db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.userId, user.id),
          validStatus ? eq(applications.status, validStatus) : undefined,
          cursorDate ? gt(applications.createdAt, cursorDate) : undefined,
        ),
      )
      .orderBy(desc(applications.createdAt))
      .limit(PAGE_SIZE + 1);

    const hasNextPage = rows.length > PAGE_SIZE;
    const data = rows.slice(0, PAGE_SIZE);

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(applications)
      .where(
        and(
          eq(applications.userId, user.id),
          validStatus ? eq(applications.status, validStatus) : undefined,
        ),
      );

    const lastItem = data[data.length - 1];

    return {
      data: data.map((r) => this.toDto(r)),
      nextCursor: hasNextPage && lastItem ? lastItem.createdAt.toISOString() : null,
      total: totalRow?.total ?? 0,
    };
  }

  // ---------------------------------------------------------------------------
  // GET /v1/applications/:id
  // ---------------------------------------------------------------------------

  async get(user: AuthUser, id: string): Promise<ApplicationResponseDto> {
    const row = await this.findOwned(user.id, id);
    return this.toDto(row);
  }

  // ---------------------------------------------------------------------------
  // PATCH /v1/applications/:id
  // ---------------------------------------------------------------------------

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    await this.findOwned(user.id, id);

    const patch: Partial<typeof applications.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (dto.company !== undefined) patch.company = dto.company;
    if (dto.role !== undefined) patch.role = dto.role;
    if (dto.location !== undefined) patch.location = dto.location ?? null;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.appliedDate !== undefined) patch.appliedDate = dto.appliedDate;
    if (dto.notes !== undefined) patch.notes = dto.notes ?? null;
    if ('jobDescriptionId' in dto) patch.jobDescriptionId = dto.jobDescriptionId ?? null;

    await this.db.update(applications).set(patch).where(eq(applications.id, id));

    const row = await this.findOwned(user.id, id);
    return this.toDto(row);
  }

  // ---------------------------------------------------------------------------
  // DELETE /v1/applications/:id
  // ---------------------------------------------------------------------------

  async remove(user: AuthUser, id: string): Promise<{ id: string; deleted: true }> {
    await this.findOwned(user.id, id);

    await this.db.delete(applications).where(eq(applications.id, id));
    this.logger.log(`Application deleted — id=${id} user=${user.id}`);
    return { id, deleted: true as const };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async findOwned(userId: string, id: string) {
    const [row] = await this.db.select().from(applications).where(eq(applications.id, id)).limit(1);

    if (!row) {
      throw new NotFoundException(`Application "${id}" not found.`);
    }

    if (row.userId !== userId) {
      throw new ForbiddenException('You do not have access to this application.');
    }

    return row;
  }

  private toDto(row: typeof applications.$inferSelect): ApplicationResponseDto {
    return {
      id: row.id,
      userId: row.userId,
      jobDescriptionId: row.jobDescriptionId ?? null,
      company: row.company,
      role: row.role,
      location: row.location ?? null,
      status: row.status,
      appliedDate: row.appliedDate,
      notes: row.notes ?? null,
      createdAt:
        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updatedAt:
        row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }
}
