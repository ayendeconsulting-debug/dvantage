// ---------------------------------------------------------------------------
// D'Vantage — Generic Fallback Site Adapter
//
// Stub implementation. Paste-area fallback added in D16.
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

  fillFields(_profile: UserProfile): AutofillResult {
    // Not supported on generic pages.
    return { filled: 0, skipped: [] };
  },
};
