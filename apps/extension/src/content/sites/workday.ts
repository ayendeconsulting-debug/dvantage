// ---------------------------------------------------------------------------
// D'Vantage — Workday Site Adapter
//
// Stub implementation. Real selectors and autofill added in D15 (best-effort).
//
// D10 change: fillFields return type updated void → AutofillResult.
// ---------------------------------------------------------------------------

import type {
  AutofillResult,
  ExtractedJob,
  FormField,
  SiteAdapter,
  UserProfile,
} from '../../shared/types';

export const workdayAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    // Stub — real DOM extraction in D15.
    return null;
  },

  detectForm(): FormField[] {
    // Stub — best-effort form detection in D15.
    return [];
  },

  extractFields(): Record<string, string> {
    return {};
  },

  fillFields(_profile: UserProfile): AutofillResult {
    // Stub — best-effort autofill in D15.
    return { filled: 0, skipped: [] };
  },
};
