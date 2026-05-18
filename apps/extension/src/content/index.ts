// ---------------------------------------------------------------------------
// D'Vantage — Content Script Entry
//
// Runs on matched job board pages at document_idle (see manifest.ts).
// Dispatches to the correct site adapter based on the current URL.
//
// Architecture (D11 — LinkedIn observe() hook added):
//   1. resolveAdapter()   — URL → site adapter (hostname matching)
//   2. runDetection()     — detectJD() + detectForm() → sendMessage as appropriate
//   3. SPA nav handling   — history.pushState / popstate intercept + debounce
//   4. observe() hook     — adapter-installed MutationObserver for modal detection
//                           (LinkedIn Easy Apply: modal appears without URL change)
//   5. onMessage listener — handles EXECUTE_AUTOFILL from background SW
//
// Message flow (JD path — unchanged from D6):
//   detectJD() found job
//   → chrome.runtime.sendMessage(JOB_DETECTED)
//   → BG SW writes ACTIVE_JOB
//   → ScorePanel reacts via storage.onChanged
//
// Message flow (form path — D10 new):
//   detectForm() found fields
//   → chrome.runtime.sendMessage(FORM_DETECTED { fieldCount, fillableFields, ... })
//   → BG SW writes ACTIVE_FORM
//   → AutofillPanel reacts via storage.onChanged
//
//   detectForm() returned empty (navigated away from form)
//   → chrome.runtime.sendMessage(FORM_CLEARED)
//   → BG SW sets ACTIVE_FORM = null
//   → AutofillPanel hides
//
// Message flow (autofill execution — D10 new):
//   Side panel: user clicks "Autofill" → REQUEST_AUTOFILL → BG SW
//   BG SW: resolves profile → chrome.tabs.sendMessage(tabId, EXECUTE_AUTOFILL)
//   Content script: adapter.fillFields(profile) → sendResponse(AutofillResult)
//   BG SW: forwards AUTOFILL_COMPLETE to side panel
//
// observe() hook (D11 new):
//   LinkedIn Easy Apply opens as a modal without a pushState event.
//   The LinkedIn adapter implements observe(), which installs a MutationObserver
//   on document.body to detect modal mount/unmount.
//   When the modal state changes, observe() calls scheduleDetection() —
//   exactly the same debounce path as SPA navigation events.
//   This means detectForm() / FORM_DETECTED / FORM_CLEARED all work identically
//   for LinkedIn as for every other adapter. Zero new architecture.
//
// SPA navigation:
//   LinkedIn, Indeed, Ashby, and Workday are SPAs. URL changes do not trigger
//   a new document load — runDetection() is re-triggered on every nav event.
//   1 000 ms debounce — do not reduce below 800 ms (DOM hydration time).
//
// This file intentionally contains no DOM selectors.
// All site-specific logic lives in content/sites/*.ts.
// ---------------------------------------------------------------------------

import type { ContentToBackground, AutofillExecutionResponse } from '../shared/messages';
import type { SiteAdapter, AutofillFieldKey, UserProfile } from '../shared/types';

import { linkedinAdapter }   from './sites/linkedin';
import { indeedAdapter }     from './sites/indeed';
import { greenhouseAdapter } from './sites/greenhouse';
import { leverAdapter }      from './sites/lever';
import { ashbyAdapter }      from './sites/ashby';
import { workdayAdapter }    from './sites/workday';
import { genericAdapter }    from './sites/generic';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPA_REDETECT_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

function resolveAdapter(): SiteAdapter {
  const { hostname } = window.location;

  if (hostname.endsWith('linkedin.com'))           return linkedinAdapter;
  if (hostname.endsWith('indeed.com'))             return indeedAdapter;
  if (
    hostname === 'boards.greenhouse.io' ||
    hostname === 'job-boards.greenhouse.io'
  )                                                return greenhouseAdapter;
  if (hostname === 'jobs.lever.co')                return leverAdapter;
  if (hostname === 'jobs.ashbyhq.com')             return ashbyAdapter;
  if (hostname.endsWith('.myworkdayjobs.com'))     return workdayAdapter;

  return genericAdapter;
}

// ---------------------------------------------------------------------------
// Messaging helpers
// ---------------------------------------------------------------------------

/**
 * Send a fire-and-forget message to the background SW.
 * Consumes lastError to suppress Chrome's unchecked-error console warning.
 */
function sendToBackground(msg: ContentToBackground): void {
  chrome.runtime.sendMessage(msg, () => {
    void chrome.runtime.lastError;
  });
}

// ---------------------------------------------------------------------------
// Detection + messaging
// ---------------------------------------------------------------------------

/**
 * Run both JD and form detection on the current page.
 *
 * JD detection:
 *   adapter.detectJD() non-null → send JOB_DETECTED.
 *   null → no message (ACTIVE_JOB retains the last detected job).
 *
 * Form detection:
 *   adapter.detectForm() non-empty → send FORM_DETECTED.
 *   empty → send FORM_CLEARED so AutofillPanel hides on navigation away.
 *
 * Both run on every navigation event — adapters use their own path guards
 * to return null / empty on pages where they don't apply.
 */
function runDetection(): void {
  const adapter = resolveAdapter();

  // ── JD detection ────────────────────────────────────────────────────────
  const job = adapter.detectJD();

  if (job) {
    sendToBackground({ type: 'JOB_DETECTED', payload: { job } });
    console.log('[DVantage Content] JOB_DETECTED sent for:', job.title ?? '(untitled)');
  } else {
    console.log(
      '[DVantage Content] No job detected on',
      window.location.hostname,
      window.location.pathname,
    );
  }

  // ── Form detection ───────────────────────────────────────────────────────
  const fields = adapter.detectForm();

  if (fields.length > 0) {
    // Build the fillable-fields preview list for AutofillPanel display.
    // Unknown-type fields are excluded from fillableFields but counted separately.
    const fillableFields  = fields
      .filter((f) => f.type !== 'unknown' && f.type !== 'file')
      .map((f) => ({
        label:      f.label ?? f.name,
        profileKey: f.name as AutofillFieldKey,
        required:   f.required,
      }));

    const unknownFieldCount = fields.filter(
      (f) => f.type === 'unknown',
    ).length;

    sendToBackground({
      type:    'FORM_DETECTED',
      payload: {
        fieldCount:        fillableFields.length,
        unknownFieldCount,
        pageUrl:           window.location.href,
        fillableFields,
      },
    });
    console.log(
      `[DVantage Content] FORM_DETECTED — fields:${fillableFields.length} unknown:${unknownFieldCount}`,
    );
  } else {
    // No form on this page — clear so AutofillPanel doesn't show stale state.
    sendToBackground({
      type:    'FORM_CLEARED',
      payload: { pageUrl: window.location.href },
    });
  }
}

// ---------------------------------------------------------------------------
// EXECUTE_AUTOFILL listener
// ---------------------------------------------------------------------------

/**
 * Listen for EXECUTE_AUTOFILL from the background service worker.
 * Received via chrome.tabs.sendMessage (not chrome.runtime.sendMessage).
 *
 * The background SW sends this after the user clicks "Autofill" in the
 * side panel and the profile has been resolved (from cache or API).
 * We call adapter.fillFields(profile) which writes to the DOM and returns
 * { filled, skipped }. The response is forwarded back to the SW synchronously
 * via sendResponse, which then informs the side panel.
 */
chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: AutofillExecutionResponse) => void,
  ): boolean | undefined => {
    if (
      typeof message !== 'object' ||
      message === null ||
      (message as Record<string, unknown>)['type'] !== 'EXECUTE_AUTOFILL'
    ) {
      return undefined; // not our message
    }

    const payload = (message as Record<string, unknown>)['payload'];
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof (payload as Record<string, unknown>)['profile'] !== 'object'
    ) {
      sendResponse({ ok: false, error: 'invalid_payload' });
      return true;
    }

    const profile = (payload as Record<string, unknown>)['profile'] as UserProfile;

    try {
      const adapter = resolveAdapter();
      const result  = adapter.fillFields(profile);

      sendResponse({ ok: true, filled: result.filled, skipped: result.skipped });
      console.log(
        `[DVantage Content] EXECUTE_AUTOFILL complete — filled:${result.filled} skipped:${result.skipped.length}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'fill_error';
      sendResponse({ ok: false, error: msg });
      console.error('[DVantage Content] EXECUTE_AUTOFILL error:', err);
    }

    return true; // keep message channel open for sendResponse
  },
);

// ---------------------------------------------------------------------------
// SPA navigation handling
// ---------------------------------------------------------------------------

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleDetection(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runDetection();
  }, SPA_REDETECT_DELAY_MS);
}

const originalPushState    = history.pushState.bind(history);
const originalReplaceState = history.replaceState.bind(history);

history.pushState = function (...args: Parameters<typeof history.pushState>): void {
  originalPushState(...args);
  scheduleDetection();
};

history.replaceState = function (...args: Parameters<typeof history.replaceState>): void {
  originalReplaceState(...args);
  scheduleDetection();
};

window.addEventListener('popstate', scheduleDetection);

// ---------------------------------------------------------------------------
// Adapter observe() hook — D11
//
// Install the adapter's MutationObserver (if any) once at page load.
// The adapter fires scheduleDetection() when its watched DOM state changes.
// For LinkedIn: fires when Easy Apply modal appears or disappears.
// For all other adapters: observe is undefined — no-op.
// ---------------------------------------------------------------------------

const adapter = resolveAdapter();
if (typeof adapter.observe === 'function') {
  adapter.observe(scheduleDetection);
  console.log('[DVantage Content] observe() hook installed for:', window.location.hostname);
}

// ---------------------------------------------------------------------------
// Initial detection
// ---------------------------------------------------------------------------

runDetection();

const adapterName =
  window.location.hostname.endsWith('linkedin.com')         ? 'linkedin'   :
  window.location.hostname.endsWith('indeed.com')           ? 'indeed'     :
  window.location.hostname === 'boards.greenhouse.io' ||
  window.location.hostname === 'job-boards.greenhouse.io'   ? 'greenhouse' :
  window.location.hostname === 'jobs.lever.co'              ? 'lever'      :
  window.location.hostname === 'jobs.ashbyhq.com'           ? 'ashby'      :
  window.location.hostname.endsWith('.myworkdayjobs.com')   ? 'workday'    :
                                                              'generic';

console.log('[DVantage Content] Dispatcher ready | adapter:', adapterName, '| host:', window.location.hostname);
