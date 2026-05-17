// ---------------------------------------------------------------------------
// D'Vantage — Lever Site Adapter
//
// Real DOM selectors implemented in D7.
//
// Supported paths (matched by manifest host_permissions):
//   https://jobs.lever.co/*
//
// Lever renders server-side HTML with clean, stable semantic markup.
// All job postings share a consistent DOM structure across customers.
// No SPA concerns — a single runDetection() on document_idle is sufficient.
//
// Lever application form (D11):
//   Clean HTML form with standard inputs; full autofill supported.
//   Resume upload via <input type="file" name="resume">.
// ---------------------------------------------------------------------------

import type { ExtractedJob, FormField, SiteAdapter, UserProfile } from '../../shared/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADAPTER_NAME = 'lever';

const SELECTORS = {
  title:          '.posting-headline h2',
  titleAlt:       'h2',
  company:        '.main-header-logo img',
  location:       '.posting-categories .location',
  locationAlt:    '.location',
  // Primary: the full-width section wrapper that contains all job description
  // sections. Concatenating its innerText gives us the complete posting body.
  description:    '.section-wrapper.page-full-width',
  // Fallback: collect individual .section elements and join them.
  sections:       '.section',
  // Broad fallback for unexpected page structures.
  descAlt:        '.posting-content',
} as const;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Normalise extracted DOM text:
 * - Strips zero-width characters (U+200B, U+FEFF, etc.)
 * - Converts non-breaking spaces to regular spaces
 * - Collapses internal whitespace runs to a single space
 * - Trims leading/trailing whitespace
 *
 * Returns null when the result is an empty string.
 */
function cleanText(raw: string | null | undefined): string | null {
  if (raw == null) return null;

  const cleaned = raw
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Return the innerText of the first element matching `selector`,
 * cleaned via cleanText(). Returns null if no match or empty result.
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
// Company extraction
// ---------------------------------------------------------------------------

/**
 * Lever always renders the company logo with the company name in the `alt`
 * attribute. This is the most reliable source.
 *
 * Fallback: parse the document title. Lever titles typically follow:
 *   "<Role Title> at <Company Name>"
 *   "<Company Name> - <Role Title>"
 */
function extractCompany(): string | null {
  // Primary — logo alt text
  const logoImg = document.querySelector<HTMLImageElement>(SELECTORS.company);
  if (logoImg) {
    const alt = cleanText(logoImg.alt);
    // Strip trailing " logo" suffix (e.g. "OSEDEA logo" → "OSEDEA") and
    // guard against generic alt values like "logo" or empty strings.
    if (alt && alt.length > 2) {
      const stripped = cleanText(alt.replace(/\s+logo$/i, ''));
      if (stripped && !/^logo$/i.test(stripped)) return stripped;
    }
  }

  // Fallback — document title
  const title = document.title;

  // "Role at Company"
  const atPattern = /\bat\s+(.+?)(?:\s*[|·–\-]|\s*$)/i;
  const atMatch = title.match(atPattern);
  if (atMatch?.[1]) {
    const candidate = cleanText(atMatch[1]);
    if (candidate) return candidate;
  }

  // "Company - Role" or "Company · Role"
  const dashPattern = /^(.+?)\s*[–\-·]\s*.+$/;
  const dashMatch = title.match(dashPattern);
  if (dashMatch?.[1]) {
    const candidate = cleanText(dashMatch[1]);
    if (candidate) return candidate;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Description extraction
// ---------------------------------------------------------------------------

/**
 * Extract the full job description text from the posting page.
 *
 * Strategy (in priority order):
 * 1. `.section-wrapper.page-full-width` — the canonical Lever description
 *    container; its innerText gives the full posting body in reading order.
 * 2. Collect all `.section` elements and join them — used when the wrapper
 *    class is absent (older Lever templates or white-label variants).
 * 3. `.posting-content` — broad fallback for significantly divergent layouts.
 *
 * Returns an empty string (never null) so ExtractedJob.description is always
 * a string, even on partial extractions.
 */
function extractDescription(): string {
  // Strategy 1 — full wrapper
  const wrapper = document.querySelector<HTMLElement>(SELECTORS.description);
  if (wrapper) {
    const text = cleanText(wrapper.innerText);
    if (text) return text;
  }

  // Strategy 2 — individual sections joined
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>(SELECTORS.sections),
  );
  if (sections.length > 0) {
    const text = sections
      .map(s => cleanText(s.innerText))
      .filter((t): t is string => t !== null)
      .join('\n\n');
    if (text.length > 0) return text;
  }

  // Strategy 3 — broad fallback
  return firstMatch(SELECTORS.descAlt) ?? '';
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const leverAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    const { pathname } = window.location;

    // Only run on individual job posting pages.
    // Lever posting paths: /companyname/<uuid>
    // Apply page: /companyname/<uuid>/apply  — skip, the JD is on the posting page
    // We detect postings by checking for a UUID-like segment in the path.
    const isApplyPage = pathname.endsWith('/apply');
    if (isApplyPage) {
      // The apply page does not render the full JD; the posting page does.
      // ACTIVE_JOB will already be set from when the user visited the posting.
      console.debug(`[DVantage][${ADAPTER_NAME}] apply page detected — JD extraction skipped`);
      return null;
    }

    // Verify this is a posting page (has at least two path segments: company + id)
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length < 2) {
      console.debug(`[DVantage][${ADAPTER_NAME}] not a job posting path (${pathname}); skipping`);
      return null;
    }

    const title = firstMatch(SELECTORS.title, SELECTORS.titleAlt);
    if (!title) {
      console.debug(`[DVantage][${ADAPTER_NAME}] title not found; not a job posting page`);
      return null;
    }

    const company     = extractCompany();
    const location    = firstMatch(SELECTORS.location, SELECTORS.locationAlt);
    const description = extractDescription();

    const job: ExtractedJob = {
      title,
      company,
      location,
      description,
      sourceUrl:   window.location.href,
      extractedAt: new Date().toISOString(),
    };

    console.debug(
      `[DVantage][${ADAPTER_NAME}] detected job:`,
      { title: job.title, company: job.company, location: job.location, descLength: job.description.length },
    );

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
