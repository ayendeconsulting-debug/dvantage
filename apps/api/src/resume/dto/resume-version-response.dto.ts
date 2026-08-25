import type { ParseStatus } from '@vantage/database';
import type { ResumeData } from '@vantage/validation';

// ---------------------------------------------------------------------------
// Upload URL response
// ---------------------------------------------------------------------------

export interface UploadUrlResponseDto {
  /** ID of the newly created resume version row. */
  resumeVersionId: string;
  /** Presigned PUT URL. Browser uploads the file body directly to this URL. */
  uploadUrl: string;
  /** UTC timestamp after which the presigned URL expires (15 min TTL). */
  expiresAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// List item — no bulk data fields
// ---------------------------------------------------------------------------

export interface ResumeVersionListItemDto {
  id: string;
  versionNumber: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  parseStatus: ParseStatus;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Paginated list response
// ---------------------------------------------------------------------------

export interface ResumeVersionListResponseDto {
  data: ResumeVersionListItemDto[];
  /** Opaque cursor for the next page. Null if this is the last page. */
  nextCursor: string | null;
  total: number;
}

// ---------------------------------------------------------------------------
// Full detail — includes parsed output and presigned download URL
// ---------------------------------------------------------------------------

export interface ResumeVersionDetailDto {
  id: string;
  versionNumber: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  parseStatus: ParseStatus;
  rawText: string | null;
  structuredData: ResumeData | null;
  parseError: string | null;
  /** Presigned GET URL valid for 1 hour. Only present when parseStatus is complete. */
  downloadUrl: string | null;
  downloadUrlExpiresAt: string | null; // ISO 8601
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Confirm response
// ---------------------------------------------------------------------------

export interface ConfirmUploadResponseDto {
  resumeVersionId: string;
  parseStatus: ParseStatus;
  message: string;
}

// ---------------------------------------------------------------------------
// Delete response
// ---------------------------------------------------------------------------

export interface DeleteResumeResponseDto {
  resumeVersionId: string;
  deleted: true;
}
