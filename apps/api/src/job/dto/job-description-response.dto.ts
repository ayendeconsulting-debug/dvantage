// ---------------------------------------------------------------------------
// List item — no content field (avoid sending 50k chars in list responses)
// ---------------------------------------------------------------------------

export interface JobDescriptionListItemDto {
  id:        string;
  title:     string | null;
  company:   string | null;
  url:       string | null;
  /** Character count of the content — lets UI show "2 400 characters" without the payload. */
  contentLength: number;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Paginated list response
// ---------------------------------------------------------------------------

export interface JobDescriptionListResponseDto {
  data:       JobDescriptionListItemDto[];
  /** Opaque cursor for the next page. Null if this is the last page. */
  nextCursor: string | null;
  total:      number;
}

// ---------------------------------------------------------------------------
// Full detail — includes content
// ---------------------------------------------------------------------------

export interface JobDescriptionDetailDto {
  id:        string;
  title:     string | null;
  company:   string | null;
  url:       string | null;
  content:   string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Delete response
// ---------------------------------------------------------------------------

export interface DeleteJobDescriptionResponseDto {
  jobDescriptionId: string;
  deleted:          true;
}
