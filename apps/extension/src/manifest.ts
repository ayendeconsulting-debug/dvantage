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
// permitted — this is the security boundary for the D3 auth bridge.
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
  // Required for the D3 auth bridge: the web app posts the bearer token to
  // the background service worker via onMessageExternal.
  externally_connectable: {
    matches: ['https://dvantage.ca/*'],
  },
  content_scripts: [
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
