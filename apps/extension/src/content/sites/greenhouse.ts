// ---------------------------------------------------------------------------
// D'Vantage — Greenhouse Site Adapter
//
// Stub implementation. Real selectors added in D7 (PRIORITY — cleanest DOM).
//
// Supported paths (matched by manifest host_permissions):
//   https://boards.greenhouse.io/*
//   https://job-boards.greenhouse.io/*
//
// Greenhouse renders server-side HTML with stable semantic selectors —
// the DOM is highly predictable across customers. This is the first adapter
// to receive real selectors in D7.
//
// D7 selector reference (do not implement until D7):
//   Job title:   h1.app-title                  (boards.greenhouse.io)
//                h1[data-qa="job-title"]        (job-boards.greenhouse.io)
//   Company:     .company-name                  (boards subdomain varies)
//   Location:    .location                      (boards)
//                [data-qa="job-location"]       (job-boards)
//   Description: #content (boards) / [data-qa="job-description"] (job-boards)
//
// Greenhouse application form (D11 — highest priority for autofill):
//   Form fields are standard HTML inputs with for/label pairs.
//   Full autofill (name, email, phone, LinkedIn, resume upload) supported.
// ---------------------------------------------------------------------------

import type { ExtractedJob, FormField, SiteAdapter, UserProfile } from '../../shared/types';

export const greenhouseAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    // Stub — real DOM extraction in D7.
    return null;
  },

  detectForm(): FormField[] {
    // Stub — full form detection in D11.
    return [];
  },

  extractFields(): Record<string, string> {
    return {};
  },

  fillFields(_profile: UserProfile): void {
    // Stub — full autofill in D11.
  },
};
