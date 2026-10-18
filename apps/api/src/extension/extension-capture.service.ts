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
//   - sourceUrl (D13): stored for dashboard deep-links and as the dedup key.
//     A partial unique index (uq_applications_user_source_date) on
//     (user_id, source_url, applied_date) prevents duplicate rows when the
//     extension autofills the same form more than once in a calendar day.
//     onConflictDoNothing() emits INSERT … ON CONFLICT DO NOTHING, which the
//     partial index catches when source_url IS NOT NULL (always true here).
//   - notes: kept for human-readable context alongside the structured sourceUrl.
// ---------------------------------------------------------------------------

import { Inject, Injectable, Logger } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';

import { applications, type DatabaseClient, type ExtensionToken } from '@vantage/database';

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

  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseClient) {}

  /**
   * Insert an application capture row, skipping silently on duplicate.
   *
   * Duplicate detection: partial unique index on (user_id, source_url,
   * applied_date) WHERE source_url IS NOT NULL (migration 0010).
   * INSERT … ON CONFLICT DO NOTHING returns an empty array on conflict,
   * allowing the service to log the skip without surfacing an error to the
   * extension (which fires this request fire-and-forget with no UI dependency).
   *
   * @param token  — validated extension token (provides userId)
   * @param dto    — capture payload from the extension
   * @returns      — inserted row summary, or synthetic duplicate response
   */
  async capture(
    token: ExtensionToken,
    dto: CaptureApplicationDto,
  ): Promise<CaptureApplicationResponseDto> {
    const userId = token.userId;
    const id = uuidv7();
    const now = new Date();

    // Normalise nullable fields — fall back to placeholder strings so the
    // NOT NULL DB constraint is satisfied while keeping rows identifiable.
    const company = dto.company?.trim() || 'Unknown Company';
    const role = dto.role?.trim() || 'Unknown Role';

    // ISO date — YYYY-MM-DD in UTC. SQL date column stores date only.
    const appliedDate = now.toISOString().slice(0, 10);

    // Human-readable note alongside the structured sourceUrl.
    const notes = `Applied via D'Vantage extension — ${dto.pageUrl}`;

    // INSERT … ON CONFLICT DO NOTHING — partial unique index catches
    // duplicate (user_id, source_url, applied_date) when source_url IS NOT NULL.
    // .returning() yields the inserted row, or an empty array on conflict.
    const [inserted] = await this.db
      .insert(applications)
      .values({
        id,
        userId,
        jobDescriptionId: null, // future: match sourceUrl → job_descriptions
        company,
        role,
        location: null,
        status: 'applied',
        appliedDate,
        sourceUrl: dto.pageUrl, // D13: dedup key + dashboard deep-link
        notes,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({
        id: applications.id,
        company: applications.company,
        role: applications.role,
        status: applications.status,
        appliedDate: applications.appliedDate,
      });

    if (!inserted) {
      // Duplicate suppressed — same user/URL/date already captured today.
      this.logger.log(
        `Extension capture skipped (duplicate) — user=${userId} url=${dto.pageUrl} date=${appliedDate}`,
      );
      // Return a synthetic response — the extension is fire-and-forget
      // and does not branch on the response body.
      return { id: 'duplicate', company, role, status: 'applied', appliedDate };
    }

    this.logger.log(
      `Extension capture complete — user=${userId} id=${inserted.id} ` +
        `company="${company}" role="${role}" date=${appliedDate}`,
    );

    return {
      id: inserted.id,
      company: inserted.company,
      role: inserted.role,
      status: 'applied',
      appliedDate: inserted.appliedDate,
    };
  }
}
