/**
 * User profile API client
 *
 * Typed fetch wrappers for GET/PATCH /v1/users/me/profile.
 * Uses the same session-cookie-based apiFetch pattern as other web app API clients.
 */

const API_BASE =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types (mirrored from backend DTOs)
// ---------------------------------------------------------------------------

export interface UserProfileData {
  phone: string | null;
  linkedinUrl: string | null;
}

export interface UpdateUserProfileInput {
  phone?: string | null;
  linkedinUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Helper (identical to subscription.ts)
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...restInit } = init ?? {};
  const hasBody = restInit.body != null;
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...initHeaders,
    },
    ...restInit,
  });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string; title?: string; message?: string };
      message = body.detail ?? body.title ?? body.message ?? message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Fetch current phone and LinkedIn URL for the signed-in user. */
export async function getUserProfile(): Promise<UserProfileData> {
  return apiFetch<UserProfileData>('/v1/users/me/profile');
}

/**
 * Update phone and/or LinkedIn URL.
 * Omit a field to leave it unchanged; pass null to clear it.
 */
export async function updateUserProfile(input: UpdateUserProfileInput): Promise<UserProfileData> {
  return apiFetch<UserProfileData>('/v1/users/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
