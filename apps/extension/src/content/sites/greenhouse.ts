// ---------------------------------------------------------------------------
// D'Vantage — Greenhouse Site Adapter
//
// Real DOM selectors implemented in D7.
//
// Supported paths (matched by manifest host_permissions):
//   https://boards.greenhouse.io/*        ← classic layout
//   https://job-boards.greenhouse.io/*    ← new layout (data-qa attributes)
//
// Both subdomains render server-side HTML — no SPA concerns.
// A single runDetection() on document_idle is sufficient.
//
// Greenhouse application form (D11 — highest priority for autofill):
//   Form fields are standard HTML inputs with for/label pairs.
//   Full autofill (name, email, phone, LinkedIn, resume upload) supported.
// ---------------------------------------------------------------------------

import type { ExtractedJob, FormField, SiteAdapter, UserProfile } from '../../shared/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADAPTER_NAME = 'greenhouse';

// boards.greenhouse.io — classic layout selectors
const CLASSIC = {
  title:       'h1.app-title',
  company:     '.company-name',
  location:    '.location',
  locationAlt: '.location-name',
  description: '#content',
  descAlt:     '.content',
} as const;

// job-boards.greenhouse.io — new layout (data-qa driven)
const NEW_BOARD = {
  title:       '[data-qa="job-title"]',
  location:    '[data-qa="job-location"]',
  description: '[data-qa="job-description"]',
} as const;

// Broad fallbacks shared by both layouts
const FALLBACK = {
  title:       'h1',
  description: 'main',
} as const;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Normalise extracted DOM text:
 * - Trims leading/trailing whitespace
 * - Collapses internal runs of whitespace (including non-breaking spaces) to a
 *   single space
 * - Strips zero-width characters (U+200B, U+FEFF, etc.)
 *
 * Returns null when the result is an empty string so callers can use ?? null
 * for optional fields.
 */
function cleanText(raw: string | null | undefined): string | null {
  if (raw == null) return null;

  const cleaned = raw
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')   // zero-width chars
    .replace(/\u00A0/g, ' ')                        // non-breaking space → space
    .replace(/\s+/g, ' ')                           // collapse whitespace
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Return the innerText of the first element matching `selector`,
 * or null if no element is found or the text is empty after cleaning.
 */
function textFrom(selector: string): string | null {
  const el = document.querySelector<HTMLElement>(selector);
  return el != null ? cleanText(el.innerText) : null;
}

/**
 * Try each selector in order and return the first non-null result.
 */
function firstMatch(...selectors: string[]): string | null {
  for (const sel of selectors) {
    const result = textFrom(sel);
    if (result != null) return result;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Company extraction helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to extract the company name from the document title.
 *
 * job-boards.greenhouse.io titles follow the pattern:
 *   "Job Application for <role title> at <Company Name>"
 *   "Jobs at <Company Name>"
 *
 * boards.greenhouse.io titles may follow:
 *   "<Role Title> at <Company Name>"
 *   "<Company Name> - Jobs"
 *
 * We try the most specific pattern first and fall back to increasingly broad
 * matches. Returns null when no pattern matches.
 */
function extractCompanyFromTitle(): string | null {
  const title = document.title;

  // "Job Application for X at Company" — job-boards subdomain
  const applicationPattern = /\bat\s+(.+?)(?:\s*[|–\-]|\s*$)/i;
  const applicationMatch = title.match(applicationPattern);
  if (applicationMatch?.[1]) {
    const candidate = cleanText(applicationMatch[1]);
    if (candidate) return candidate;
  }

  // "Jobs at Company" — job-boards index / subdomain variants
  const jobsAtPattern = /^Jobs\s+at\s+(.+?)(?:\s*[|–\-]|\s*$)/i;
  const jobsAtMatch = title.match(jobsAtPattern);
  if (jobsAtMatch?.[1]) {
    const candidate = cleanText(jobsAtMatch[1]);
    if (candidate) return candidate;
  }

  // "Company - Jobs" — reversed format sometimes seen on classic boards
  const dashPattern = /^(.+?)\s*[–\-]\s*Jobs?\s*$/i;
  const dashMatch = title.match(dashPattern);
  if (dashMatch?.[1]) {
    const candidate = cleanText(dashMatch[1]);
    if (candidate) return candidate;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Layout-specific extraction
// ---------------------------------------------------------------------------

/** Detect JD fields on the classic boards.greenhouse.io layout. */
function extractClassic(): ExtractedJob | null {
  const title = firstMatch(CLASSIC.title, FALLBACK.title);
  if (!title) {
    console.debug(`[DVantage][${ADAPTER_NAME}] classic layout — title not found; not a job posting page`);
    return null;
  }

  const company =
    firstMatch(CLASSIC.company) ??
    extractCompanyFromTitle();

  const location    = firstMatch(CLASSIC.location, CLASSIC.locationAlt);
  const description =
    firstMatch(CLASSIC.description, CLASSIC.descAlt, FALLBACK.description) ?? '';

  return {
    title,
    company,
    location,
    description,
    sourceUrl:   window.location.href,
    extractedAt: new Date().toISOString(),
  };
}

/** Detect JD fields on the new job-boards.greenhouse.io layout. */
function extractNewBoard(): ExtractedJob | null {
  const title = firstMatch(NEW_BOARD.title, FALLBACK.title);
  if (!title) {
    console.debug(`[DVantage][${ADAPTER_NAME}] new-board layout — title not found; not a job posting page`);
    return null;
  }

  // Company is not exposed via data-qa on this subdomain.
  // The document title is the most reliable source.
  const company = extractCompanyFromTitle();

  const location    = firstMatch(NEW_BOARD.location, CLASSIC.location);
  const description =
    firstMatch(NEW_BOARD.description, CLASSIC.description, FALLBACK.description) ?? '';

  return {
    title,
    company,
    location,
    description,
    sourceUrl:   window.location.href,
    extractedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const greenhouseAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    const { hostname, pathname } = window.location;

    // Only run on individual job posting pages.
    // Boards list pages (no job ID in path) return null — nothing to score.
    // Greenhouse job paths: /companyname/jobs/<id>  or  /jobs/<id>
    const isJobPage = /\/jobs\/\d+/.test(pathname);
    if (!isJobPage) {
      console.debug(`[DVantage][${ADAPTER_NAME}] not a job posting path (${pathname}); skipping`);
      return null;
    }

    const isNewBoard = hostname === 'job-boards.greenhouse.io';
    const job = isNewBoard ? extractNewBoard() : extractClassic();

    if (job) {
      console.debug(
        `[DVantage][${ADAPTER_NAME}] detected job:`,
        { title: job.title, company: job.company, location: job.location, descLength: job.description.length },
      );
    }

    return job;
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
