// ---------------------------------------------------------------------------
// D'Vantage — Content Script Entry
//
// Runs on matched job board pages at document_idle (see manifest.ts).
// Dispatches to the correct site adapter based on the current URL,
// then sends JOB_DETECTED to the background service worker when a JD
// is successfully extracted.
//
// Architecture (D6):
//   1. resolveAdapter()   — URL → site adapter (hostname matching)
//   2. runDetection()     — adapter.detectJD() → sendMessage(JOB_DETECTED)
//   3. SPA nav handling   — history.pushState / popstate intercept + debounce
//
// SPA navigation:
//   LinkedIn, Indeed, Ashby, and Workday are SPAs. URL changes do not trigger
//   a new document load — this content script runs once per page load.
//   We intercept history.pushState and history.replaceState plus the popstate
//   event to re-run detection after client-side navigation settles.
//   A 1 000 ms debounce ensures DOM hydration is complete before querying.
//
// Message flow:
//   Content script → chrome.runtime.sendMessage(JOB_DETECTED)
//   → Background SW (message-router.ts) → chrome.storage.local.set(ACTIVE_JOB)
//   → chrome.storage.onChanged fires in side panel
//   → ScorePanel re-renders with detected job
//
// This file intentionally contains no DOM selectors.
// All site-specific logic lives in content/sites/*.ts.
// ---------------------------------------------------------------------------

import type { ContentToBackground } from '../shared/messages';
import type { SiteAdapter }         from '../shared/types';

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

/** Delay after a SPA navigation before re-running detection.
 *  Gives the framework time to finish rendering the new page. */
const SPA_REDETECT_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

/**
 * Resolve the correct site adapter for the current page.
 * Matching order matters — more specific checks before broad ones.
 */
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
// Detection + messaging
// ---------------------------------------------------------------------------

/**
 * Run job detection on the current page using the resolved site adapter.
 * If a job is found, send JOB_DETECTED to the background service worker.
 * The background SW writes ACTIVE_JOB to chrome.storage.local;
 * the ScorePanel in the side panel reacts via storage.onChanged.
 */
function runDetection(): void {
  const adapter = resolveAdapter();
  const job     = adapter.detectJD();

  if (!job) {
    // No job found at the current URL — do not send a message.
    // ACTIVE_JOB retains the last detected job until a new one overwrites it.
    // Clearing logic (when user navigates away from all job pages) is a D7+ concern.
    console.log(
      '[DVantage Content] No job detected on',
      window.location.hostname,
      window.location.pathname,
    );
    return;
  }

  const message: ContentToBackground = {
    type:    'JOB_DETECTED',
    payload: { job },
  };

  chrome.runtime.sendMessage(message, () => {
    // Consume lastError to suppress Chrome's unchecked error console warning.
    // The background SW handles the storage write; we do not need the ack.
    void chrome.runtime.lastError;

    if (chrome.runtime.lastError) {
      // Log for debugging but do not crash — the SW may be spinning up.
      console.warn(
        '[DVantage Content] JOB_DETECTED sendMessage error:',
        chrome.runtime.lastError.message,
      );
      return;
    }

    console.log('[DVantage Content] JOB_DETECTED sent for:', job.title ?? '(untitled)');
  });
}

// ---------------------------------------------------------------------------
// SPA navigation handling
// ---------------------------------------------------------------------------

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a detection run after a SPA navigation event.
 * Debounced to avoid redundant checks during rapid history mutations.
 */
function scheduleDetection(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runDetection();
  }, SPA_REDETECT_DELAY_MS);
}

/**
 * Intercept history.pushState to detect SPA navigations.
 * This must be done at content-script injection time, before any
 * framework code runs its own pushState calls.
 */
const originalPushState    = history.pushState.bind(history);
const originalReplaceState = history.replaceState.bind(history);

history.pushState = function (
  ...args: Parameters<typeof history.pushState>
): void {
  originalPushState(...args);
  scheduleDetection();
};

history.replaceState = function (
  ...args: Parameters<typeof history.replaceState>
): void {
  originalReplaceState(...args);
  scheduleDetection();
};

// Browser-native back/forward navigation.
window.addEventListener('popstate', scheduleDetection);

// ---------------------------------------------------------------------------
// Initial detection
// ---------------------------------------------------------------------------

// Run immediately on script load (document_idle — DOM is ready).
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
