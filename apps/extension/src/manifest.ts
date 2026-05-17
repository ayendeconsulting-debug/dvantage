// ---------------------------------------------------------------------------
// D'Vantage — Manifest V3 definition
//
// Uses defineManifest() from @crxjs/vite-plugin (confirmed API: beta.33).
// crxjs processes entry points at build time:
//   - background.service_worker → resolved from source, bundled to SW
//   - content_scripts.js        → resolved from source, bundled per-site
//   - side_panel.default_path   → 'sidepanel.html' at extension root
//
// externally_connectable restricts which web origins may call
// chrome.runtime.sendMessage into this extension. Only dvantage.ca is
// permitted — kept as belt-and-suspenders alongside the content script bridge.
//
// D4: auth-bridge.ts content script added — injected on dvantage.ca/extension/auth.
//   Bridges CustomEvent (web page) ↔ chrome.runtime.sendMessage (BG SW).
//   Resolves chrome.runtime unavailability via externally_connectable on
//   some Chrome configurations (object | undefined diagnostic confirmed D4).
//
// Spec reference: CHROME_EXTENSION_V1_SPEC.md §6
// ---------------------------------------------------------------------------
import { defineManifest } from '@crxjs/vite-plugin';
export default defineManifest({
  manifest_version: 3,
  name:             "D'Vantage \u2014 From applied to interview",
  version:          '1.0.0',
  description:      'Score and apply to jobs with AI. No mass auto-submit.',
  action: {
    default_title: "D'Vantage",
  },
  // sidepanel.html lives at the extension root; crxjs serves it from dist/.
  side_panel: {
    default_path: 'sidepanel.html',
  },
  // Point to SOURCE file — crxjs bundles it into the service worker.
  background: {
    service_worker: 'src/background/index.ts',
    type:           'module',
  },
  permissions: ['storage', 'activeTab', 'scripting', 'sidePanel', 'cookies'],
  host_permissions: [
    'https://api.dvantage.ca/*',
    'https://*.linkedin.com/jobs/*',
    'https://*.indeed.com/*',
    'https://boards.greenhouse.io/*',
    'https://job-boards.greenhouse.io/*',
    'https://jobs.lever.co/*',
    'https://jobs.ashbyhq.com/*',
    'https://*.myworkdayjobs.com/*',
  ],
  // Allow dvantage.ca to call chrome.runtime.sendMessage into this extension.
  // Belt-and-suspenders alongside the auth-bridge content script (D4).
  externally_connectable: {
    matches: ['https://dvantage.ca/*'],
  },
  content_scripts: [
    // D4: Auth bridge — injected on the extension auth callback page only.
    // Bridges CustomEvent from the web page to chrome.runtime.sendMessage
    // so the background SW can store the extension token reliably.
    {
      matches: ['https://dvantage.ca/extension/auth*'],
      js:      ['src/content/auth-bridge.ts'],
      run_at:  'document_idle',
    },
    // Job board content scripts — Phase 2 Week 2.
    {
      matches: [
        'https://*.linkedin.com/jobs/*',
        'https://*.indeed.com/*',
        'https://boards.greenhouse.io/*',
        'https://job-boards.greenhouse.io/*',
        'https://jobs.lever.co/*',
        'https://jobs.ashbyhq.com/*',
        'https://*.myworkdayjobs.com/*',
      ],
      js:     ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
});
