// ---------------------------------------------------------------------------
// D'Vantage — Workday Site Adapter
//
// Stub implementation. Real selectors added in D8 (complex — best-effort).
//
// Supported paths (matched by manifest host_permissions):
//   https://*.myworkdayjobs.com/*
//
// Workday is an Angular SPA with deeply nested, dynamically generated
// class names. Selectors must target stable data attributes where available.
// Score is supported; autofill and capture are best-effort only (see spec §5).
//
// D8 selector reference (do not implement until D8):
//   Job title:   [data-automation-id="jobPostingHeader"] h2
//   Company:     [data-automation-id="companyName"]  (not always present)
//   Location:    [data-automation-id="locations"]
//   Description: [data-automation-id="jobPostingDescription"]
//
// Workday application form (D15 — best-effort):
//   Angular-rendered dynamic forms. Field detection is label-text-based.
//   Shadow DOM may block access on some tenants.
// ---------------------------------------------------------------------------

import type { ExtractedJob, FormField, SiteAdapter, UserProfile } from '../../shared/types';

export const workdayAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    // Stub — real DOM extraction in D8.
    return null;
  },

  detectForm(): FormField[] {
    // Stub — best-effort form detection in D15.
    return [];
  },

  extractFields(): Record<string, string> {
    return {};
  },

  fillFields(_profile: UserProfile): void {
    // Stub — best-effort autofill in D15.
  },
};
