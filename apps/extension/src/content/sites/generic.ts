// ---------------------------------------------------------------------------
// D'Vantage — Generic Fallback Site Adapter
//
// Stub implementation. Real implementation added in D16.
//
// Invoked on: any page not matched by a named site adapter.
//
// The generic adapter is the paste-area fallback described in spec §5.
// Rather than attempting unreliable DOM extraction on arbitrary pages,
// D16 will inject a floating widget into the page that lets the user
// manually paste the job description text.
//
// D16 implementation plan:
//   detectJD() — check for user-pasted content in extension storage
//                keyed by current tab URL; return ExtractedJob if found.
//   detectForm() — not supported on generic pages.
//   fillFields() — not supported.
//
// Until D16 this adapter always returns null, which causes the ScorePanel
// to show its "Navigate to a job posting" empty state on unsupported pages.
// This is the correct UX — the user should visit a supported board.
// ---------------------------------------------------------------------------

import type { ExtractedJob, FormField, SiteAdapter, UserProfile } from '../../shared/types';

export const genericAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    // Stub — manual paste-area fallback in D16.
    return null;
  },

  detectForm(): FormField[] {
    // Not supported on generic pages.
    return [];
  },

  extractFields(): Record<string, string> {
    return {};
  },

  fillFields(_profile: UserProfile): void {
    // Not supported on generic pages.
  },
};
