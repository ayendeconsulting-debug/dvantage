// ---------------------------------------------------------------------------
// D'Vantage — Indeed Site Adapter
//
// Stub implementation. Real selectors added in D7.
//
// Supported paths (matched by manifest host_permissions):
//   https://*.indeed.com/*
//
// Indeed is a hybrid SPA — some navigations trigger full page loads,
// others are client-side. The SPA dispatcher in content/index.ts handles
// both by re-running detectJD() on every navigation event.
//
// D7 selector reference (do not implement until D7):
//   Job title:   h1.jobsearch-JobInfoHeader-title
//   Company:     [data-testid="inlineHeader-companyName"] a
//   Location:    [data-testid="job-location"]
//   Description: #jobDescriptionText
//
// Indeed Apply form detection (D14):
//   Indeed redirects to an iframe-hosted form; CSP constraints apply.
//   Autofill is best-effort only (see spec §5).
// ---------------------------------------------------------------------------

import type { ExtractedJob, FormField, SiteAdapter, UserProfile } from '../../shared/types';

export const indeedAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    // Stub — real DOM extraction in D7.
    return null;
  },

  detectForm(): FormField[] {
    // Stub — Indeed Apply form detection in D14.
    return [];
  },

  extractFields(): Record<string, string> {
    return {};
  },

  fillFields(_profile: UserProfile): void {
    // Stub — best-effort autofill in D14.
  },
};
