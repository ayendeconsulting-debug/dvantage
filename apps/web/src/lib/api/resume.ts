/**
 * Resume API client
 *
 * Typed fetch wrappers for all resume endpoints.
 * Uses credentials: 'include' so better-auth session cookies are sent automatically.
 * All mutations include an Idempotency-Key header (generated client-side).
 */

const API_BASE =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) ||
  'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types (mirrored from backend DTOs)
// ---------------------------------------------------------------------------

export type ParseStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'parsing'
  | 'complete'
  | 'failed';

export interface ResumeVersionListItem {
  id:            string;
  versionNumber: number;
  fileName:      string;
  fileSize:      number;
  mimeType:      string;
  parseStatus:   ParseStatus;
  createdAt:     string;
  updatedAt:     string;
}

export interface ResumeVersionDetail extends ResumeVersionListItem {
  rawText:              string | null;
  structuredData:       ResumeData | null;
  parseError:           string | null;
  downloadUrl:          string | null;
  downloadUrlExpiresAt: string | null;
}

export interface ResumeVersionListResponse {
  data:       ResumeVersionListItem[];
  nextCursor: string | null;
  total:      number;
}

export interface UploadUrlResponse {
  resumeVersionId: string;
  uploadUrl:       string;
  expiresAt:       string;
}

export interface ConfirmUploadResponse {
  resumeVersionId: string;
  parseStatus:     ParseStatus;
  message:         string;
}

// Minimal ResumeData types for rendering
export interface ResumeContact {
  name:     string;
  email:    string;
  phone?:   string;
  location?:string;
  linkedin?:string;
  github?:  string;
}

export interface ResumeExperience {
  company:    string;
  title:      string;
  startDate:  string;
  endDate?:   string;
  current:    boolean;
  description:string;
  highlights: string[];
}

export interface ResumeEducation {
  institution: string;
  degree:      string;
  field:       string;
  startDate:   string;
  endDate?:    string;
  gpa?:        string;
}

export interface ResumeSkill {
  name:      string;
  category:  'technical' | 'soft' | 'language' | 'tool';
  level?:    string;
}

export interface ResumeCertification {
  name:       string;
  issuer:     string;
  date?:      string;
  expiryDate?:string;
  url?:       string;
}

export interface ResumeData {
  contact:        ResumeContact;
  summary:        string;
  experience:     ResumeExperience[];
  education:      ResumeEducation[];
  skills:         ResumeSkill[];
  certifications: ResumeCertification[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function idempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { headers: initHeaders, ...restInit } = init ?? {};
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...initHeaders },
    ...restInit,
  });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = await res.json() as { detail?: string; title?: string };
      message = body.detail ?? body.title ?? message;
    } catch { /* ignore parse errors */ }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Upload a resume file via the API proxy (browser → API → R2).
 * This avoids CORS issues with direct browser→R2 presigned PUT uploads.
 * Uses XHR for progress tracking.
 */
export function uploadResume(
  file: File,
  onProgress: (pct: number) => void,
): Promise<ConfirmUploadResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/v1/resumes/upload`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Idempotency-Key', idempotencyKey());

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        try {
          resolve(JSON.parse(xhr.responseText) as ConfirmUploadResponse);
        } catch {
          reject(new Error('Invalid response from server.'));
        }
      } else {
        let message = `Upload failed: HTTP ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText) as { detail?: string; title?: string };
          message = body.detail ?? body.title ?? message;
        } catch { /* ignore */ }
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed: network error'));
    xhr.send(formData);
  });
}

/** Request a presigned upload URL. Creates a pending resume version row. */
export async function createUploadUrl(payload: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<UploadUrlResponse> {
  return apiFetch<UploadUrlResponse>('/v1/resumes/upload-url', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey() },
    body: JSON.stringify(payload),
  });
}

/**
 * Upload a file directly to storage via presigned URL.
 * Returns a Promise that resolves when the PUT completes.
 * Calls onProgress(0..100) as the upload progresses.
 */
export function uploadToStorage(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Storage upload failed: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Storage upload failed: network error'));
    xhr.send(file);
  });
}

/** Confirm upload complete. Enqueues the parse job. */
export async function confirmUpload(
  resumeVersionId: string,
): Promise<ConfirmUploadResponse> {
  return apiFetch<ConfirmUploadResponse>(
    `/v1/resumes/${resumeVersionId}/confirm`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey() },
      body: '{}',
    },
  );
}

/** List all resume versions for the current user. */
export async function listResumes(
  cursor?: string,
): Promise<ResumeVersionListResponse> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiFetch<ResumeVersionListResponse>(`/v1/resumes${qs}`);
}

/** Get a single resume version including parsed data and download URL. */
export async function getResume(id: string): Promise<ResumeVersionDetail> {
  return apiFetch<ResumeVersionDetail>(`/v1/resumes/${id}`);
}

/** Soft-delete a resume version. */
export async function deleteResume(
  id: string,
): Promise<{ resumeVersionId: string; deleted: true }> {
  return apiFetch(`/v1/resumes/${id}`, { method: 'DELETE' });
}
