// ---------------------------------------------------------------------------
// D'Vantage — Lever Site Adapter
//
// Stub implementation. Real selectors added in D8 (priority 2 after Greenhouse).
//
// Supported paths (matched by manifest host_permissions):
//   https://jobs.lever.co/*
//
// Lever renders server-side HTML with clean, stable semantic markup.
// All job postings share a consistent DOM structure across customers.
//
// D8 selector reference (do not implement until D8):
//   Job title:   .posting-headline h2
//   Company:     .main-header-logo img[alt]  (alt attribute = company name)
//   Location:    .posting-categories .location
//   Description: .section-wrapper.page-full-width (concatenate all .section)
//
// Lever application form (D11):
//   Clean HTML form with standard inputs; full autofill supported.
//   Resume upload via <input type="file" name="resume">.
// ---------------------------------------------------------------------------

import type { ExtractedJob, FormField, SiteAdapter, UserProfile } from '../../shared/types';

export const leverAdapter: SiteAdapter = {
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
