// ---------------------------------------------------------------------------
// D'Vantage — Background Message Router
//
// D13 Tier A changes:
//   - AutofillExecutionResponse.skipped is now SkippedField[] (from shared/messages.ts)
//   - handleRequestAutofill forwards SkippedField[] to the panel as-is
//   - Log line updated: skipped.length (works with both string[] and SkippedField[])
//   - No other structural changes — type changes flow through from shared/types.ts
// ---------------------------------------------------------------------------

import { STORAGE_KEYS, API_BASE, PROFILE_CACHE_TTL_MS } from '../shared/constants';
import type { ScoreResult, ActiveForm, UserProfile, CachedProfile, SkippedField } from '../shared/types';
import type { AutofillExecutionResponse, AiFillExecutionResponse, SubmitExecutionResponse } from '../shared/messages';

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isValidJobDetectedPayload(
  payload: unknown,
): payload is { job: { description: string; sourceUrl: string; [key: string]: unknown } } {
  if (typeof payload !== 'object' || payload === null) return false;
  const p   = payload as Record<string, unknown>;
  const job = p['job'];
  if (typeof job !== 'object' || job === null) return false;
  const j = job as Record<string, unknown>;
  return (
    typeof j['description'] === 'string' &&
    typeof j['sourceUrl']   === 'string'
  );
}

function isValidScorePayload(
  payload: unknown,
): payload is { jobDescription: string; resumeId: string | null } {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p['jobDescription'] === 'string' &&
    (p['resumeId'] === null || typeof p['resumeId'] === 'string')
  );
}

function isValidFormDetectedPayload(
  payload: unknown,
): payload is {
  fieldCount:        number;
  unknownFieldCount: number;
  pageUrl:           string;
  fillableFields:    unknown[];
  manualFields:      unknown[];
} {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p['fieldCount']        === 'number'  &&
    typeof p['unknownFieldCount'] === 'number'  &&
    typeof p['pageUrl']           === 'string'  &&
    Array.isArray(p['fillableFields'])           &&
    (p['manualFields'] === undefined || Array.isArray(p['manualFields']))
  );
}

function isValidAutofillPayload(
  payload: unknown,
): payload is { pageUrl: string } {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p['pageUrl'] === 'string';
}

function isValidProfileUpdatePayload(
  payload: unknown,
): payload is { phone: string | null; linkedinUrl: string | null } {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    (p['phone']       === null || typeof p['phone']       === 'string') &&
    (p['linkedinUrl'] === null || typeof p['linkedinUrl'] === 'string')
  );
}

function isValidCapturePayload(
  payload: unknown,
): payload is { company: string | null; role: string | null; pageUrl: string } {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    (p['company'] === null || typeof p['company'] === 'string') &&
    (p['role']    === null || typeof p['role']    === 'string') &&
    typeof p['pageUrl'] === 'string'
  );
}

// ---------------------------------------------------------------------------
// Profile cache helpers
// ---------------------------------------------------------------------------

async function getCachedProfile(): Promise<UserProfile | null> {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.CACHED_PROFILE]);
    const entry  = stored[STORAGE_KEYS.CACHED_PROFILE] as CachedProfile | undefined;
    if (!entry?.profile || !entry?.cachedAt) return null;
    const ageMs = Date.now() - new Date(entry.cachedAt).getTime();
    if (ageMs > PROFILE_CACHE_TTL_MS) {
      console.log('[DVantage Router] CACHED_PROFILE expired — will re-fetch');
      return null;
    }
    return entry.profile;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: UserProfile): void {
  const entry: CachedProfile = { profile, cachedAt: new Date().toISOString() };
  void chrome.storage.local.set({ [STORAGE_KEYS.CACHED_PROFILE]: entry });
  console.log('[DVantage Router] CACHED_PROFILE written');
}

async function fetchProfile(token: string): Promise<UserProfile> {
  const response = await fetch(`${API_BASE}/v1/extension/profile`, {
    method:  'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  if (!response.ok) throw new Error(`GET /v1/extension/profile → HTTP ${response.status}`);
  const data = await response.json() as unknown;
  if (typeof data !== 'object' || data === null) {
    throw new Error('GET /v1/extension/profile → invalid JSON response shape');
  }
  return data as UserProfile;
}

async function resolveProfile(): Promise<UserProfile> {
  const cached = await getCachedProfile();
  if (cached) {
    console.log('[DVantage Router] CACHED_PROFILE hit — skipping API call');
    return cached;
  }
  const stored = await chrome.storage.local.get([STORAGE_KEYS.EXTENSION_TOKEN]);
  const token  = stored[STORAGE_KEYS.EXTENSION_TOKEN] as string | undefined;
  if (!token) throw new Error('not_authenticated');
  const profile = await fetchProfile(token);
  writeCachedProfile(profile);
  return profile;
}

// ---------------------------------------------------------------------------
// JOB_DETECTED handler
// ---------------------------------------------------------------------------

function handleJobDetected(payload: unknown): void {
  if (!isValidJobDetectedPayload(payload)) {
    console.warn('[DVantage Router] JOB_DETECTED — invalid payload shape, ignoring');
    return;
  }
  chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_JOB]: payload.job }, () => {
    if (chrome.runtime.lastError) {
      console.error('[DVantage Router] ACTIVE_JOB write failed:', chrome.runtime.lastError.message);
      return;
    }
    console.log(
      '[DVantage Router] ACTIVE_JOB stored — title:',
      (payload.job as Record<string, unknown>)['title'] ?? '(untitled)',
      '| source:', payload.job.sourceUrl,
    );
  });
}

// ---------------------------------------------------------------------------
// FORM_DETECTED handler
// ---------------------------------------------------------------------------

function handleFormDetected(payload: unknown): void {
  if (!isValidFormDetectedPayload(payload)) {
    console.warn('[DVantage Router] FORM_DETECTED — invalid payload shape, ignoring');
    return;
  }
  const activeForm: ActiveForm = {
    fieldCount:        payload.fieldCount,
    unknownFieldCount: payload.unknownFieldCount,
    pageUrl:           payload.pageUrl,
    fillableFields:    payload.fillableFields as ActiveForm['fillableFields'],
    manualFields:      (payload.manualFields ?? []) as ActiveForm['manualFields'],
  };
  chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_FORM]: activeForm }, () => {
    if (chrome.runtime.lastError) {
      console.error('[DVantage Router] ACTIVE_FORM write failed:', chrome.runtime.lastError.message);
      return;
    }
    console.log(
      `[DVantage Router] ACTIVE_FORM stored — fields:${payload.fieldCount} ` +
      `manual:${activeForm.manualFields.length} ` +
      `unknown:${payload.unknownFieldCount} url:${payload.pageUrl}`,
    );
  });
}

// ---------------------------------------------------------------------------
// FORM_CLEARED handler
// ---------------------------------------------------------------------------

function handleFormCleared(): void {
  chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_FORM]: null }, () => {
    if (chrome.runtime.lastError) {
      console.warn('[DVantage Router] ACTIVE_FORM clear failed:', chrome.runtime.lastError.message);
      return;
    }
    console.log('[DVantage Router] ACTIVE_FORM cleared');
  });
}

// ---------------------------------------------------------------------------
// REQUEST_SCORE handler
// ---------------------------------------------------------------------------

function handleRequestScore(
  payload:      unknown,
  sendResponse: (response: unknown) => void,
): void {
  if (!isValidScorePayload(payload)) {
    sendResponse({ ok: false, error: 'invalid_payload' });
    return;
  }

  void (async (): Promise<void> => {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.EXTENSION_TOKEN]);
    const token  = stored[STORAGE_KEYS.EXTENSION_TOKEN] as string | undefined;
    if (!token) {
      sendResponse({ ok: false, error: 'not_authenticated' });
      return;
    }

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/v1/extension/score`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobDescription: payload.jobDescription,
          resumeId:       payload.resumeId,
        }),
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      sendResponse({ ok: false, error: isTimeout ? 'timeout' : 'network_error' });
      console.error('[DVantage Router] REQUEST_SCORE — fetch failed:', err);
      return;
    }

    clearTimeout(timeoutId);

    if (response.status === 401) { sendResponse({ ok: false, error: 'auth_expired' }); return; }
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      sendResponse({ ok: false, error: 'scoring_failed' });
      console.error(`[DVantage Router] REQUEST_SCORE — API error ${response.status}:`, errText.slice(0, 200));
      return;
    }

    let data: unknown;
    try { data = await response.json() as unknown; }
    catch { sendResponse({ ok: false, error: 'invalid_response' }); return; }

    sendResponse({ ok: true, result: data });

    const score = typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)['score'] : '?';
    console.log('[DVantage Router] REQUEST_SCORE — score received:', score);

    void (async (): Promise<void> => {
      try {
        const jobStored = await chrome.storage.local.get([STORAGE_KEYS.ACTIVE_JOB]);
        const activeJob = jobStored[STORAGE_KEYS.ACTIVE_JOB] as Record<string, unknown> | undefined;
        const sourceUrl = typeof activeJob?.['sourceUrl'] === 'string' ? activeJob['sourceUrl'] : null;
        if (!sourceUrl) return;
        await chrome.storage.local.set({ [STORAGE_KEYS.CACHED_SCORE]: { sourceUrl, result: data } });
        console.log('[DVantage Router] CACHED_SCORE written — url:', sourceUrl);
      } catch (err) {
        console.warn('[DVantage Router] CACHED_SCORE write failed:', err);
      }
    })();
  })();
}

// ---------------------------------------------------------------------------
// REQUEST_PROFILE handler
// ---------------------------------------------------------------------------

function handleRequestProfile(sendResponse: (response: unknown) => void): void {
  void (async (): Promise<void> => {
    try {
      const profile = await resolveProfile();
      sendResponse({ ok: true, profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown_error';
      sendResponse({ ok: false, error: message });
      console.error('[DVantage Router] REQUEST_PROFILE — failed:', err);
    }
  })();
}

// ---------------------------------------------------------------------------
// REQUEST_AUTOFILL handler
// ---------------------------------------------------------------------------

function handleRequestAutofill(
  payload:      unknown,
  sendResponse: (response: unknown) => void,
): void {
  if (!isValidAutofillPayload(payload)) {
    sendResponse({ ok: false, error: 'invalid_payload' });
    return;
  }

  void (async (): Promise<void> => {
    let profile: UserProfile;
    try {
      profile = await resolveProfile();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'profile_fetch_failed';
      sendResponse({ ok: false, error: msg });
      return;
    }

    let tabId: number | undefined;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tabs[0]?.id;
    } catch (err) {
      console.error('[DVantage Router] REQUEST_AUTOFILL — chrome.tabs.query failed:', err);
    }

    if (!tabId) {
      sendResponse({ ok: false, error: 'no_active_tab' });
      return;
    }

    let result: AutofillExecutionResponse;
    try {
      result = await chrome.tabs.sendMessage(tabId, {
        type: 'EXECUTE_AUTOFILL', payload: { profile },
      }) as AutofillExecutionResponse;
    } catch (err) {
      sendResponse({ ok: false, error: 'content_script_error' });
      console.error('[DVantage Router] REQUEST_AUTOFILL — sendMessage failed:', err);
      return;
    }

    if (!result.ok) { sendResponse({ ok: false, error: result.error }); return; }

    // D13 Tier A: result.skipped is now SkippedField[] — forwarded as-is to the panel
    sendResponse({ ok: true, fieldsFilled: result.filled, skipped: result.skipped });
    console.log(
      `[DVantage Router] REQUEST_AUTOFILL complete — filled:${result.filled} skipped:${result.skipped.length}`,
    );
  })();
}

// ---------------------------------------------------------------------------
// REQUEST_PROFILE_UPDATE handler
// ---------------------------------------------------------------------------

function handleRequestProfileUpdate(
  payload:      unknown,
  sendResponse: (response: unknown) => void,
): void {
  if (!isValidProfileUpdatePayload(payload)) {
    sendResponse({ ok: false, error: 'invalid_payload' });
    return;
  }

  void (async (): Promise<void> => {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.EXTENSION_TOKEN]);
    const token  = stored[STORAGE_KEYS.EXTENSION_TOKEN] as string | undefined;
    if (!token) { sendResponse({ ok: false, error: 'not_authenticated' }); return; }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/v1/extension/profile`, {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept':        'application/json',
        },
        body: JSON.stringify({ phone: payload.phone, linkedinUrl: payload.linkedinUrl }),
      });
    } catch (err) {
      sendResponse({ ok: false, error: 'network_error' });
      console.error('[DVantage Router] REQUEST_PROFILE_UPDATE — fetch failed:', err);
      return;
    }

    if (response.status === 401) { sendResponse({ ok: false, error: 'not_authenticated' }); return; }
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      sendResponse({ ok: false, error: 'update_failed' });
      console.error(`[DVantage Router] REQUEST_PROFILE_UPDATE — API error ${response.status}:`, errText.slice(0, 200));
      return;
    }

    let freshProfile: UserProfile;
    try {
      const data = await response.json() as unknown;
      if (typeof data !== 'object' || data === null) throw new Error('invalid shape');
      freshProfile = data as UserProfile;
    } catch (err) {
      sendResponse({ ok: false, error: 'invalid_response' });
      console.error('[DVantage Router] REQUEST_PROFILE_UPDATE — parse failed:', err);
      return;
    }

    writeCachedProfile(freshProfile);
    sendResponse({ ok: true, profile: freshProfile });
    console.log('[DVantage Router] REQUEST_PROFILE_UPDATE complete');
  })();
}

// ---------------------------------------------------------------------------
// REQUEST_CAPTURE handler
// ---------------------------------------------------------------------------

function handleRequestCapture(payload: unknown): void {
  if (!isValidCapturePayload(payload)) {
    console.warn('[DVantage Router] REQUEST_CAPTURE — invalid payload, ignoring');
    return;
  }

  void (async (): Promise<void> => {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.EXTENSION_TOKEN]);
    const token  = stored[STORAGE_KEYS.EXTENSION_TOKEN] as string | undefined;
    if (!token) {
      console.warn('[DVantage Router] REQUEST_CAPTURE — no token, skipping');
      return;
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/v1/extension/applications`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept':        'application/json',
        },
        body: JSON.stringify({
          company: payload.company,
          role:    payload.role,
          pageUrl: payload.pageUrl,
        }),
      });
    } catch (err) {
      console.warn('[DVantage Router] REQUEST_CAPTURE — network error:', err);
      return;
    }

    if (!response.ok) {
      console.warn(`[DVantage Router] REQUEST_CAPTURE — API error ${response.status}`);
      return;
    }

    try {
      const data = await response.json() as Record<string, unknown>;
      console.log(
        `[DVantage Router] REQUEST_CAPTURE complete — id=${data['id'] ?? '?'} ` +
        `company="${data['company'] ?? '?'}" role="${data['role'] ?? '?'}"`,
      );
    } catch {
      console.log('[DVantage Router] REQUEST_CAPTURE complete (response parse skipped)');
    }
  })();
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// D13 Tier B: REQUEST_AI_FILL validator + handler
// ---------------------------------------------------------------------------

function isValidAiFillPayload(
  payload: unknown,
): payload is { resumeId: string | null; fields: SkippedField[] } {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    (p['resumeId'] === null || typeof p['resumeId'] === 'string') &&
    Array.isArray(p['fields']) &&
    (p['fields'] as unknown[]).length > 0
  );
}

function handleRequestAiFill(
  payload:      unknown,
  sendResponse: (r: unknown) => void,
): void {
  if (!isValidAiFillPayload(payload)) { sendResponse({ ok: false, error: 'invalid_payload' }); return; }
  const { resumeId, fields } = payload;

  void (async (): Promise<void> => {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.EXTENSION_TOKEN]);
    const token  = stored[STORAGE_KEYS.EXTENSION_TOKEN] as string | undefined;
    if (!token) { sendResponse({ ok: false, error: 'not_authenticated' }); return; }

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 20_000);

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/v1/extension/ai-fill`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        body: JSON.stringify({
          resumeId,
          fields: fields.map((f) => ({ label: f.label, fieldType: f.fieldType, required: f.required })),
        }),
      });
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('[DVantage Router] REQUEST_AI_FILL — fetch error:', err);
      sendResponse({ ok: true, aiFilled: 0, remaining: fields });
      return;
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[DVantage Router] REQUEST_AI_FILL — API ${response.status}`);
      sendResponse({ ok: true, aiFilled: 0, remaining: fields });
      return;
    }

    let apiData: { answers: Array<{ label: string; value: string | null }> };
    try { apiData = await response.json() as typeof apiData; }
    catch { sendResponse({ ok: true, aiFilled: 0, remaining: fields }); return; }

    const toFill: Array<{ label: string; value: string; selector: string; fieldType: string }> = [];
    const remaining: SkippedField[] = [];

    apiData.answers.forEach((answer, i) => {
      const field = fields[i];
      if (!field) return;
      if (answer.value?.trim()) {
        toFill.push({ label: field.label, value: answer.value.trim(), selector: field.selector, fieldType: field.fieldType });
      } else {
        remaining.push(field);
      }
    });

    console.log(`[DVantage Router] REQUEST_AI_FILL — toFill:${toFill.length} remaining:${remaining.length}`);

    if (toFill.length === 0) { sendResponse({ ok: true, aiFilled: 0, remaining }); return; }

    let tabId: number | undefined;
    try { const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); tabId = tabs[0]?.id; }
    catch { /* ignore */ }

    if (!tabId) { sendResponse({ ok: true, aiFilled: 0, remaining: fields }); return; }

    let fillResult: AiFillExecutionResponse;
    try {
      fillResult = await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_AI_FILL', payload: { answers: toFill } }) as AiFillExecutionResponse;
    } catch (err) {
      console.warn('[DVantage Router] REQUEST_AI_FILL — EXECUTE_AI_FILL failed:', err);
      sendResponse({ ok: true, aiFilled: 0, remaining: fields });
      return;
    }

    const aiFilled = fillResult.ok ? fillResult.aiFilled : 0;
    sendResponse({ ok: true, aiFilled, remaining });
    console.log(`[DVantage Router] REQUEST_AI_FILL complete — aiFilled:${aiFilled}`);
  })();
}


// ---------------------------------------------------------------------------
// D13 Tier C: REQUEST_SUBMIT handler
// ---------------------------------------------------------------------------

/**
 * Forward a user-initiated submit request to the content script.
 * The content script finds and clicks the form's submit button.
 * Returns { ok: true } on success or { ok: false, error } on failure.
 */
function handleRequestSubmit(sendResponse: (r: unknown) => void): void {
  void (async (): Promise<void> => {
    let tabId: number | undefined;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tabs[0]?.id;
    } catch { /* ignore */ }

    if (!tabId) { sendResponse({ ok: false, error: 'no_active_tab' }); return; }

    let result: SubmitExecutionResponse;
    try {
      result = await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_SUBMIT' }) as SubmitExecutionResponse;
    } catch (err) {
      console.warn('[DVantage Router] REQUEST_SUBMIT — sendMessage failed:', err);
      sendResponse({ ok: false, error: 'submit_failed' });
      return;
    }

    sendResponse(result);
    if (result.ok) console.log('[DVantage Router] REQUEST_SUBMIT — form submitted');
  })();
}

// ---------------------------------------------------------------------------
// Public router — called from background/index.ts onMessage listener
// ---------------------------------------------------------------------------

export function routeMessage(
  message:      unknown,
  sender:       chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean | undefined {
  if (typeof message !== 'object' || message === null) return undefined;

  const m    = message as Record<string, unknown>;
  const type = m['type'];

  switch (type) {
    case 'JOB_DETECTED':   { if (!sender.tab) return undefined; handleJobDetected(m['payload']); return undefined; }
    case 'FORM_DETECTED':  { if (!sender.tab) return undefined; handleFormDetected(m['payload']); return undefined; }
    case 'FORM_CLEARED':   { if (!sender.tab) return undefined; handleFormCleared(); return undefined; }
    case 'REQUEST_SCORE':  { if (sender.tab)  return undefined; handleRequestScore(m['payload'], sendResponse); return true; }
    case 'REQUEST_PROFILE':         { handleRequestProfile(sendResponse); return true; }
    case 'REQUEST_AUTOFILL':        { handleRequestAutofill(m['payload'], sendResponse); return true; }
    case 'REQUEST_PROFILE_UPDATE':  { handleRequestProfileUpdate(m['payload'], sendResponse); return true; }
    case 'REQUEST_CAPTURE':         { handleRequestCapture(m['payload']); return undefined; }
    case 'REQUEST_AI_FILL':         { handleRequestAiFill(m['payload'], sendResponse); return true; }
    case 'REQUEST_SUBMIT':           { handleRequestSubmit(sendResponse); return true; }
    default: return undefined;
  }
}

export type { ScoreResult };
