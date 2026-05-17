// ---------------------------------------------------------------------------
// D'Vantage — Manifest V3 definition
// Uses defineManifest() from @crxjs/vite-plugin (confirmed API: beta.33).
//
// Token delivery (D4): callback.html pattern.
// After exchange, web app navigates to chrome-extension://extId/callback.html.
// callback.html runs as extension code — unconditional chrome.storage access.
// externally_connectable + auth-bridge content script kept as inert fallbacks.
// ---------------------------------------------------------------------------
import { defineManifest } from '@crxjs/vite-plugin';
export default defineManifest({
  manifest_version: 3,
  name:             "D'Vantage \u2014 From applied to interview",
  version:          '1.0.0',
  description:      'Score and apply to jobs with AI. No mass auto-submit.',
  action: { default_title: "D'Vantage" },
  side_panel: { default_path: 'sidepanel.html' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  permissions: ['storage', 'activeTab', 'scripting', 'sidePanel', 'cookies'],
  host_permissions: [
    'https://dvantage.ca/*',
    'https://api.dvantage.ca/*',
    'https://*.linkedin.com/jobs/*',
    'https://*.indeed.com/*',
    'https://boards.greenhouse.io/*',
    'https://job-boards.greenhouse.io/*',
    'https://jobs.lever.co/*',
    'https://jobs.ashbyhq.com/*',
    'https://*.myworkdayjobs.com/*',
  ],
  externally_connectable: { matches: ['https://dvantage.ca/*'] },
  content_scripts: [
    { matches: ['https://dvantage.ca/*'], js: ['src/content/auth-bridge.ts'], run_at: 'document_idle' },
    {
      matches: [
        'https://*.linkedin.com/jobs/*', 'https://*.indeed.com/*',
        'https://boards.greenhouse.io/*', 'https://job-boards.greenhouse.io/*',
        'https://jobs.lever.co/*', 'https://jobs.ashbyhq.com/*', 'https://*.myworkdayjobs.com/*',
      ],
      js: ['src/content/index.ts'], run_at: 'document_idle',
    },
  ],
  // callback.html — extension-native auth callback. Only dvantage.ca may navigate here.
  // use_dynamic_url: false gives a stable URL the web app can construct.
  web_accessible_resources: [
    { matches: ['https://dvantage.ca/*'], resources: ['callback.html'], use_dynamic_url: false },
  ],
});
