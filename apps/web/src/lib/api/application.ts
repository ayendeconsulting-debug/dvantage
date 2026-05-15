const API_BASE =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) ||
  'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApplicationStatus =
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export interface Application {
  id:                string;
  userId:            string;
  jobDescriptionId:  string | null;
  company:           string;
  role:              string;
  location:          string | null;
  status:            ApplicationStatus;
  appliedDate:       string;   // YYYY-MM-DD
  notes:             string | null;
  createdAt:         string;
  updatedAt:         string;
}

export interface ApplicationListResponse {
  data:       Application[];
  nextCursor: string | null;
  total:      number;
}

export interface CreateApplicationInput {
  company:          string;
  role:             string;
  appliedDate:      string;
  status:           ApplicationStatus;
  location?:        string;
  notes?:           string;
  jobDescriptionId?: string;
}

export interface UpdateApplicationInput {
  company?:          string;
  role?:             string;
  location?:         string | null;
  status?:           ApplicationStatus;
  appliedDate?:      string;
  notes?:            string | null;
  jobDescriptionId?: string | null;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
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

export async function listApplications(params?: {
  status?: ApplicationStatus;
  cursor?: string;
}): Promise<ApplicationListResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.cursor) qs.set('cursor', params.cursor);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<ApplicationListResponse>(`/v1/applications${query}`);
}

export async function createApplication(
  input: CreateApplicationInput,
): Promise<Application> {
  return apiFetch<Application>('/v1/applications', {
    method: 'POST',
    body:   JSON.stringify(input),
  });
}

export async function updateApplication(
  id:    string,
  input: UpdateApplicationInput,
): Promise<Application> {
  return apiFetch<Application>(`/v1/applications/${id}`, {
    method: 'PATCH',
    body:   JSON.stringify(input),
  });
}

export async function deleteApplication(
  id: string,
): Promise<{ id: string; deleted: true }> {
  return apiFetch(`/v1/applications/${id}`, { method: 'DELETE' });
}
