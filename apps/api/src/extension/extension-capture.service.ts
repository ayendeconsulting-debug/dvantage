// ---------------------------------------------------------------------------
// ExtensionCaptureService
//
// Records an application capture when the extension autofills a job form.
// Inserts into the existing `applications` table with status='applied'.
//
// Design decisions:
//   - Reuses `applications` table — no new table. Extension captures and
//     manually-tracked applications live in the same table; the web app
//     dashboard shows both without distinction.
//   - company/role: stored as-is from the extension payload. If JD detection
//     returned null, we fall back to 'Unknown Company' / 'Unknown Role' so the
//     NOT NULL constraint is satisfied and the row is still useful.
//   - appliedDate: set server-side to today's date in UTC. The extension does
//     not send a date — server authority prevents timezone drift across locales.
//   - jobDescriptionId: null for all extension captures (MVP). Future: match
//     sourceUrl against saved job_descriptions and link if found.
//   - notes: stores the pageUrl so the user can navigate back to the posting.
// ---------------------------------------------------------------------------

import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq }                          from 'drizzle-orm';
import { uuidv7 }                      from 'uuidv7';

import {
  applications,
  type DatabaseClient,
  type ExtensionToken,
} from '@vantage/database';

import { DATABASE_CLIENT } from '../database/database.module';
import type {
  CaptureApplicationDto,
  CaptureApplicationResponseDto,
} from './dto/capture-application.dto';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ExtensionCaptureService {
  private readonly logger = new Logger(ExtensionCaptureService.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseClient,
  ) {}

  /**
   * Insert an application capture row.
   *
   * Called after a successful autofill. The record appears immediately in the
   * web app dashboard under Applications.
   *
   * @param token  — validated extension token (provides userId)
   * @param dto    — capture payload from the extension
   * @returns      — inserted row summary
   */
  async capture(
    token: ExtensionToken,
    dto:   CaptureApplicationDto,
  ): Promise<CaptureApplicationResponseDto> {
    const userId  = token.userId;
    const id      = uuidv7();
    const now     = new Date();

    // Normalise nullable fields — fall back to placeholder strings so the
    // NOT NULL DB constraint is satisfied while keeping rows identifiable.
    const company = dto.company?.trim() || 'Unknown Company';
    const role    = dto.role?.trim()    || 'Unknown Role';

    // ISO date — YYYY-MM-DD in UTC. SQL date column stores date only.
    const appliedDate = now.toISOString().slice(0, 10);

    // Store the pageUrl as a note so the user can navigate back to the posting.
    const notes = `Applied via D'Vantage extension — ${dto.pageUrl}`;

    await this.db.insert(applications).values({
      id,
      userId,
      jobDescriptionId: null,   // future: match sourceUrl → job_descriptions
      company,
      role,
      location:    null,
      status:      'applied',
      appliedDate,
      notes,
      createdAt: now,
      updatedAt: now,
    });

    this.logger.log(
      `Extension capture complete — user=${userId} id=${id} ` +
      `company="${company}" role="${role}" date=${appliedDate}`,
    );

    return { id, company, role, status: 'applied', appliedDate };
  }
}
