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
  name: "D'Vantage \u2014 From applied to interview",
  version: '1.0.1',
  description: 'Score and apply to jobs with AI. No mass auto-submit.',
  action: { default_title: "D'Vantage" },
  side_panel: { default_path: 'sidepanel.html' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  // Minimised 2026-08-24. Removed 'cookies', 'scripting' and 'activeTab':
  //   cookies    — zero references to chrome.cookies anywhere in src/. The
  //                dvantage_ext_pending cookie the web app writes has no
  //                consumer; the listener described in its comments was never
  //                built. Triggers a scary install warning for nothing.
  //   scripting  — zero references to chrome.scripting. All injection is
  //                declarative via content_scripts below.
  //   activeTab  — redundant: 'tabs' plus host_permissions already grant
  //                everything chrome.tabs.query needs here.
  // Removing permissions never re-prompts or disables an installed extension
  // (only additions do), so this is safe to ship to existing users. It also
  // removes a Chrome Web Store review risk — unjustified permissions are a
  // documented rejection reason.
  permissions: ['storage', 'tabs', 'sidePanel'],
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
    {
      matches: ['https://dvantage.ca/*'],
      js: ['src/content/auth-bridge.ts'],
      run_at: 'document_idle',
    },
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
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  // callback.html — extension-native auth callback. Only dvantage.ca may navigate here.
  // use_dynamic_url: false gives a stable URL the web app can construct.
  web_accessible_resources: [
    { matches: ['https://dvantage.ca/*'], resources: ['callback.html'], use_dynamic_url: false },
  ],
});
