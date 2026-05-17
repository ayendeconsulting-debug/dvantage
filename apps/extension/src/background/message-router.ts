// ---------------------------------------------------------------------------
// D'Vantage — Background Message Router
//
// Routes chrome.runtime.onMessage events that are NOT handled by the
// existing auth handlers (REQUEST_REFRESH, AUTH_BRIDGE_TOKEN) in index.ts.
//
// Called from background/index.ts onMessage listener as the final delegate:
//   if (isAuthBridge) → handle in index.ts
//   if (isRefresh)    → handle in index.ts
//   else              → routeMessage(msg, sender, sendResponse)  ← this file
//
// Handlers (D6):
//   JOB_DETECTED    — content script found a job; write to ACTIVE_JOB storage.
//                     ScorePanel in the side panel reacts via storage.onChanged.
//
//   REQUEST_SCORE   — side panel user clicked "Score against my resume".
//                     D6: returns a realistic stub ScoreResult (800 ms delay).
//                     D9: replace stub with POST /v1/extension/score API call.
//
//   REQUEST_AUTOFILL — side panel user clicked "Autofill". D11 stub only.
//
// Return value contract (mirrors onMessage listener):
//   return true      → async sendResponse; keep message channel open
//   return undefined → synchronous or no sendResponse; channel may close
// ---------------------------------------------------------------------------

import { STORAGE_KEYS, APP_BASE } from '../shared/constants';
import type { ScoreResult }        from '../shared/types';

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a JOB_DETECTED message payload contains an ExtractedJob.
 * We only require `description` (used for scoring) and `sourceUrl`.
 * Other fields are nullable per the ExtractedJob interface.
 */
function isValidJobDetectedPayload(
  payload: unknown,
): payload is { job: { description: string; sourceUrl: string; [key: string]: unknown } } {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
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

// ---------------------------------------------------------------------------
// JOB_DETECTED handler
// ---------------------------------------------------------------------------

/**
 * Store the detected job in chrome.storage.local under ACTIVE_JOB.
 * The ScorePanel's storage.onChanged listener picks this up automatically.
 *
 * Security: caller must validate sender.tab is present before calling
 * (ensures message came from a content script, not an extension page).
 */
function handleJobDetected(payload: unknown): void {
  if (!isValidJobDetectedPayload(payload)) {
    console.warn('[DVantage Router] JOB_DETECTED — invalid payload shape, ignoring');
    return;
  }

  const { job } = payload;

  chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_JOB]: job }, () => {
    if (chrome.runtime.lastError) {
      console.error(
        '[DVantage Router] ACTIVE_JOB write failed:',
        chrome.runtime.lastError.message,
      );
      return;
    }
    console.log(
      '[DVantage Router] ACTIVE_JOB stored — title:',
      (job as Record<string, unknown>)['title'] ?? '(untitled)',
      '| source:',
      job.sourceUrl,
    );
  });
  // No sendResponse needed — content script sends JOB_DETECTED fire-and-forget.
}

// ---------------------------------------------------------------------------
// REQUEST_SCORE handler
// ---------------------------------------------------------------------------

/**
 * Score the active resume against the provided job description.
 *
 * D6 stub: returns a realistic ScoreResult after 800 ms to exercise the
 * side panel's loading state. Real API call replaces this in D9.
 *
 * D9 implementation note:
 *   Replace the stub block with:
 *     const result = await apiClient.post('/v1/extension/score', {
 *       jobDescription: payload.jobDescription,
 *       resumeId:       payload.resumeId,
 *     });
 */
function handleRequestScore(
  payload:      unknown,
  sendResponse: (response: unknown) => void,
): void {
  if (!isValidScorePayload(payload)) {
    sendResponse({ ok: false, error: 'invalid_payload' });
    return;
  }

  void (async (): Promise<void> => {
    // ---------------------------------------------------------------------------
    // D6 STUB — replace entire block in D9 with real API call
    // ---------------------------------------------------------------------------
    await new Promise<void>((resolve) => setTimeout(resolve, 800));

    const stubResult: ScoreResult = {
      score:        72,
      keywordGaps:  ['TypeScript', 'NestJS', 'PostgreSQL', 'REST APIs'],
      semanticGaps: ['System design experience', 'Cross-functional leadership'],
      optimizationUrl: `${APP_BASE}/dashboard`,
    };
    // ---------------------------------------------------------------------------
    // END STUB
    // ---------------------------------------------------------------------------

    sendResponse({ ok: true, result: stubResult });
    console.log('[DVantage Router] REQUEST_SCORE — stub result sent (score:', stubResult.score, ')');
  })();
}

// ---------------------------------------------------------------------------
// REQUEST_AUTOFILL handler (D11 stub)
// ---------------------------------------------------------------------------

function handleRequestAutofill(sendResponse: (response: unknown) => void): void {
  // D11: inject autofill logic via chrome.scripting.executeScript into the
  // active tab, using the resolved site adapter's fillFields() method.
  sendResponse({ ok: false, error: 'not_implemented' });
  console.log('[DVantage Router] REQUEST_AUTOFILL — stub (D11)');
}

// ---------------------------------------------------------------------------
// Public router — called from background/index.ts onMessage listener
// ---------------------------------------------------------------------------

/**
 * Route a chrome.runtime message to the correct handler.
 *
 * @returns true  if sendResponse will be called asynchronously
 * @returns undefined if the message was not handled or was handled synchronously
 */
export function routeMessage(
  message:      unknown,
  sender:       chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean | undefined {
  if (typeof message !== 'object' || message === null) return undefined;

  const m    = message as Record<string, unknown>;
  const type = m['type'];

  switch (type) {
    case 'JOB_DETECTED': {
      // JOB_DETECTED must originate from a content script (sender.tab present).
      if (!sender.tab) {
        console.warn('[DVantage Router] JOB_DETECTED received from non-content-script context — ignoring');
        return undefined;
      }
      handleJobDetected(m['payload']);
      return undefined; // fire-and-forget; no sendResponse
    }

    case 'REQUEST_SCORE': {
      // REQUEST_SCORE must originate from the side panel (no sender.tab).
      if (sender.tab) {
        console.warn('[DVantage Router] REQUEST_SCORE from unexpected content-script context — ignoring');
        return undefined;
      }
      handleRequestScore(m['payload'], sendResponse);
      return true; // async — keep message channel open
    }

    case 'REQUEST_AUTOFILL': {
      handleRequestAutofill(sendResponse);
      return undefined; // synchronous stub response
    }

    default:
      return undefined; // not handled here — caller may fall through
  }
}
