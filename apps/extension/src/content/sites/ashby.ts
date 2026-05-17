// ---------------------------------------------------------------------------
// D'Vantage — Ashby Site Adapter
//
// Stub implementation. Real selectors added in D8.
//
// Supported paths (matched by manifest host_permissions):
//   https://jobs.ashbyhq.com/*
//
// Ashby is a React SPA. Job posting pages are client-rendered;
// the SPA dispatcher in content/index.ts fires detectJD() on each
// navigation event. The DOM is stable across customers.
//
// D8 selector reference (do not implement until D8):
//   Job title:   h1 (first h1 on /jobs/:company/:jobId)
//   Company:     [data-testid="company-name"] or heading sibling
//   Location:    [data-testid="job-location"]  (verify in D8)
//   Description: [data-testid="job-description"] or .ashby-job-posting-description
//
// Ashby application form (D11):
//   React-rendered; field detection uses label text matching.
//   Full autofill supported (name, email, phone, LinkedIn, resume).
// ---------------------------------------------------------------------------

import type { ExtractedJob, FormField, SiteAdapter, UserProfile } from '../../shared/types';

export const ashbyAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    // Stub — real DOM extraction in D8.
    return null;
  },

  detectForm(): FormField[] {
    // Stub — form detection in D11.
    return [];
  },

  extractFields(): Record<string, string> {
    return {};
  },

  fillFields(_profile: UserProfile): void {
    // Stub — autofill in D11.
  },
};
