// ---------------------------------------------------------------------------
// D'Vantage – Content Script Entry
//
// Runs on matched job board pages at document_idle (see manifest.ts).
// Dispatches to the correct site adapter based on the current URL.
//
// Architecture (D12 – manualFields routing added):
//   1. resolveAdapter()   – URL → site adapter (hostname matching)
//   2. runDetection()     – detectJD() + detectForm() → sendMessage as appropriate
//   3. SPA nav handling   – history.pushState / popstate intercept + debounce
//   4. observe() hook     – adapter-installed MutationObserver for modal detection
//                           (LinkedIn Easy Apply, Indeed Apply: modal appears
//                           without URL change)
//   5. onMessage listener – handles EXECUTE_AUTOFILL from background SW
//
// Message flow (JD path – unchanged from D6):
//   detectJD() found job
//   → chrome.runtime.sendMessage(JOB_DETECTED)
//   → BG SW writes ACTIVE_JOB
//   → ScorePanel reacts via storage.onChanged
//
// Message flow (form path – D10, extended D12):
//   detectForm() found fields
//   → content/index.ts partitions:
//       fillableFields  – type !== 'unknown' && type !== 'file'  → auto-filled
//       manualFields    – type === 'file'                        → 📎 indicator
//       unknownFields   – type === 'unknown'                     → ⚠ count
//   → fieldCount = fillableFields.length + manualFields.length (D12: combined)
//   → chrome.runtime.sendMessage(FORM_DETECTED { fieldCount, fillableFields,
//                                                manualFields, ... })
//   → BG SW writes ACTIVE_FORM
//   → AutofillPanel reacts via storage.onChanged
//
//   detectForm() returned empty (navigated away from form)
//   → chrome.runtime.sendMessage(FORM_CLEARED)
//   → BG SW sets ACTIVE_FORM = null
//   → AutofillPanel hides
//
// Message flow (autofill execution – D10):
//   Side panel: user clicks "Autofill" → REQUEST_AUTOFILL → BG SW
//   BG SW: resolves profile → chrome.tabs.sendMessage(EXECUTE_AUTOFILL)
//   Content script: adapter.fillFields(profile) → sendResponse(AutofillResult)
//   BG SW: forwards AUTOFILL_COMPLETE to side panel
//
// observe() hook (D11, extended D12):
//   LinkedIn Easy Apply and Indeed Apply open as modals without a pushState.
//   Adapters that implement observe() install a MutationObserver on
//   document.body to detect modal mount/unmount. When modal state changes,
//   observe() calls scheduleDetection() – the same 1000ms debounce path as
//   SPA navigation events. Zero new architecture.
//
// SPA navigation:
//   LinkedIn, Indeed, Ashby, and Workday are SPAs. URL changes do not trigger
//   a new document load – runDetection() is re-triggered on every nav event.
//   1 000 ms debounce – do not reduce below 800 ms (DOM hydration time).
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
 * Form detection (D12 field partitioning):
 *   adapter.detectForm() non-empty → partition into three buckets:
 *     fillableFields  – type !== 'unknown' && type !== 'file'
 *                       Sent in FORM_DETECTED; auto-filled on user request.
 *     manualFields    – type === 'file'
 *                       Sent in FORM_DETECTED; shown with 📎 label in panel.
 *                       Never attempted by fillFields() (browser security restriction).
 *     unknownFields   – type === 'unknown'
 *                       Counted in unknownFieldCount; shown as ⚠ in panel header.
 *   fieldCount = fillableFields.length + manualFields.length (combined total).
 *
 *   empty → send FORM_CLEARED so AutofillPanel hides on navigation away.
 *
 * Both run on every navigation event – adapters use their own path guards
 * to return null / empty on pages where they don't apply.
 */
function runDetection(): void {
  const adapter = resolveAdapter();

  // ── JD detection ───────────────────────────────────────────────────────
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

  // ── Form detection ─────────────────────────────────────────────────────
  const fields = adapter.detectForm();

  if (fields.length > 0) {
    // ── Bucket 1: auto-fillable fields ──────────────────────────────────
    // type !== 'unknown' && type !== 'file'
    // Mapped to AutofillPreviewField[] for panel value preview.
    const fillableFields = fields
      .filter((f) => f.type !== 'unknown' && f.type !== 'file')
      .map((f) => ({
        label:      f.label ?? f.name,
        profileKey: f.name as AutofillFieldKey,
        required:   f.required,
      }));

    // ── Bucket 2: manual upload fields (D12) ────────────────────────────
    // type === 'file' – browsers block programmatic value setting on file inputs.
    // Shown in AutofillPanel with 📎 "Manual upload required" label.
    const manualFields = fields
      .filter((f) => f.type === 'file')
      .map((f) => ({
        label:    f.label ?? 'File upload',
        required: f.required,
      }));

    // ── Bucket 3: unknown fields ─────────────────────────────────────────
    // Detected but not mappable to a profile key.
    // Counted for the ⚠ indicator in the panel header.
    const unknownFieldCount = fields.filter((f) => f.type === 'unknown').length;

    // fieldCount = fillable + manual (combined). unknownFieldCount is separate.
    const fieldCount = fillableFields.length + manualFields.length;

    sendToBackground({
      type:    'FORM_DETECTED',
      payload: {
        fieldCount,
        unknownFieldCount,
        pageUrl: window.location.href,
        fillableFields,
        manualFields,
      },
    });
    console.log(
      `[DVantage Content] FORM_DETECTED – fillable:${fillableFields.length} ` +
      `manual:${manualFields.length} unknown:${unknownFieldCount}`,
    );
  } else {
    // No form on this page – clear so AutofillPanel doesn't show stale state.
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
        `[DVantage Content] EXECUTE_AUTOFILL complete – filled:${result.filled} skipped:${result.skipped.length}`,
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
// Adapter observe() hook – D11, extended D12
//
// Install the adapter's MutationObserver (if any) once at page load.
// The adapter fires scheduleDetection() when its watched DOM state changes.
// For LinkedIn: fires when Easy Apply modal appears or disappears.
// For Indeed:   fires when Indeed Apply modal appears or disappears.
// For all other adapters: observe is undefined – no-op.
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
