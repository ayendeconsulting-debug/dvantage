// ---------------------------------------------------------------------------
// D'Vantage — LinkedIn Jobs Site Adapter
//
// Stub implementation. Real selectors added in D7.
//
// Supported paths (matched by manifest host_permissions):
//   https://*.linkedin.com/jobs/*
//
// LinkedIn is a React SPA — detectJD() is called on each navigation event
// fired by the SPA-aware dispatcher in content/index.ts.
//
// D7 selector reference (do not implement until D7):
//   Job title:   .job-details-jobs-unified-top-card__job-title h1
//   Company:     .job-details-jobs-unified-top-card__company-name a
//   Location:    .job-details-jobs-unified-top-card__bullet:first-child
//   Description: #job-details .jobs-description__content
//
// LinkedIn Easy Apply form detection (D14):
//   Form is rendered in a modal drawer; selector strategy TBD in D14.
// ---------------------------------------------------------------------------

import type { ExtractedJob, FormField, SiteAdapter, UserProfile } from '../../shared/types';

export const linkedinAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    // Stub — real DOM extraction in D7.
    return null;
  },

  detectForm(): FormField[] {
    // Stub — Easy Apply form detection in D14.
    return [];
  },

  extractFields(): Record<string, string> {
    return {};
  },

  fillFields(_profile: UserProfile): void {
    // Stub — autofill implementation in D14.
  },
};
