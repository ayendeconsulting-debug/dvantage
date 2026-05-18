// ---------------------------------------------------------------------------
// D'Vantage — Indeed Site Adapter
//
// Real DOM selectors implemented in D8 (detectJD).
// detectForm / fillFields: Indeed Apply (iframe) — D14 (best-effort).
//
// D10 change: fillFields return type updated void → AutofillResult.
// ---------------------------------------------------------------------------

import type { AutofillResult, ExtractedJob, FormField, SiteAdapter, UserProfile } from '../../shared/types';

const ADAPTER_NAME = 'indeed';

const HEADER = {
  titleTestId:    'h1[data-testid="jobsearch-JobInfoHeader-title"]',
  titleClass:     'h1.jobsearch-JobInfoHeader-title',
  companyTestId:  '[data-testid="inlineHeader-companyName"] a',
  companyAttr:    '[data-company-name]',
  locationTestId: '[data-testid="job-location"]',
  locationAlt:    '[data-testid="inlineHeader-companyLocation"]',
} as const;

const DESCRIPTION = {
  primary: '#jobDescriptionText',
  broad:   '.jobsearch-JobComponent-description',
} as const;

const FALLBACK = { title: 'h1' } as const;

function cleanText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = raw
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function textFrom(selector: string): string | null {
  const el = document.querySelector<HTMLElement>(selector);
  return el != null ? cleanText(el.innerText) : null;
}

function firstMatch(...selectors: string[]): string | null {
  for (const sel of selectors) {
    const result = textFrom(sel);
    if (result != null) return result;
  }
  return null;
}

function extractCompanyFromTitle(): string | null {
  const title        = document.title;
  const withoutSuffix = title.replace(/\s*\|\s*Indeed\s*$/i, '').trim();
  const parts        = withoutSuffix.split(/\s*-\s*/);
  if (parts.length >= 2) {
    const candidate = cleanText(parts[1]);
    if (candidate) return candidate;
  }
  return null;
}

function isJobPostingPage(): boolean {
  const { pathname, search } = window.location;
  if (pathname === '/viewjob') return true;
  if (pathname === '/jobs') {
    return new URLSearchParams(search).has('vjk');
  }
  return false;
}

export const indeedAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    if (!isJobPostingPage()) {
      console.debug(`[DVantage][${ADAPTER_NAME}] not a job posting path (${window.location.pathname}); skipping`);
      return null;
    }

    const title = firstMatch(HEADER.titleTestId, HEADER.titleClass, FALLBACK.title);
    if (!title) {
      console.debug(`[DVantage][${ADAPTER_NAME}] title not found — DOM may not be hydrated yet`);
      return null;
    }

    const company =
      firstMatch(HEADER.companyTestId, HEADER.companyAttr) ??
      extractCompanyFromTitle();

    const location    = firstMatch(HEADER.locationTestId, HEADER.locationAlt);
    const description = firstMatch(DESCRIPTION.primary, DESCRIPTION.broad) ?? '';

    const job: ExtractedJob = {
      title,
      company,
      location,
      description,
      sourceUrl:   window.location.href,
      extractedAt: new Date().toISOString(),
    };

    console.debug(`[DVantage][${ADAPTER_NAME}] detected job:`, {
      title: job.title, company: job.company, location: job.location, descLength: job.description.length,
    });

    return job;
  },

  detectForm(): FormField[] {
    // Stub — Indeed Apply iframe detection in D14 (best-effort; CSP constraints apply).
    return [];
  },

  extractFields(): Record<string, string> {
    return {};
  },

  fillFields(_profile: UserProfile): AutofillResult {
    // Stub — best-effort autofill in D14.
    return { filled: 0, skipped: [] };
  },
};
