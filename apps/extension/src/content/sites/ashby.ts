// ---------------------------------------------------------------------------
// D'Vantage — Ashby Site Adapter
//
// Full implementation added in D10. (detectJD was a stub; skipped in D8.)
//
// Supported paths:
//   https://jobs.ashbyhq.com/*
//
// Ashby is a React SPA. Job posting pages are client-rendered.
// The SPA dispatcher in content/index.ts fires detectJD() + detectForm() on each
// navigation event. All selectors target stable attributes.
//
// ── detectJD ──────────────────────────────────────────────────────────────
//
// Job posting URL: jobs.ashbyhq.com/:company/:jobId
// Apply URL:       jobs.ashbyhq.com/:company/:jobId/application  (skip JD)
//
// Selector strategy (most-stable to least):
//   Title:       h1 (first on posting page)
//   Company:     [data-testid="org-name"] | meta[property="og:site_name"]
//   Location:    [data-testid="location"]  | div containing "Remote"/"Hybrid" text
//   Description: .ashby-job-posting-description | [data-testid="job-description"]
//
// ── detectForm / fillFields ──────────────────────────────────────────────
//
// Ashby apply page: /company/:jobId/application
// Ashby forms are React-controlled. Label-based selector strategy is most
// resilient — Ashby generates input IDs that match label[for] attributes.
//
// Field detection uses two passes:
//   1. Exact id-based selectors (fastest, most reliable when stable)
//   2. Label-text-based fallback (robust to id generation changes)
// ---------------------------------------------------------------------------

import type {
  AutofillResult,
  ExtractedJob,
  FormField,
  SiteAdapter,
  UserProfile,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADAPTER_NAME = 'ashby';

const JD_SELECTORS = {
  title:          'h1',
  orgName:        '[data-testid="org-name"]',
  location:       '[data-testid="location"]',
  descPrimary:    '.ashby-job-posting-description',
  descTestId:     '[data-testid="job-description"]',
  descFallback:   'main',
} as const;

// ---------------------------------------------------------------------------
// Text helpers (canonical pattern — locked Decision 88)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Native input setter — React controlled-input compatibility
// ---------------------------------------------------------------------------

const nativeInputSetter    = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,    'value')?.set;
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

function fillInput(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (el instanceof HTMLTextAreaElement) {
    if (nativeTextareaSetter) nativeTextareaSetter.call(el, value);
    else el.value = value;
  } else {
    if (nativeInputSetter) nativeInputSetter.call(el, value);
    else el.value = value;
  }
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ---------------------------------------------------------------------------
// Company extraction
// ---------------------------------------------------------------------------

function extractCompany(): string | null {
  // Primary: data-testid attribute added by Ashby for org branding
  const orgEl = textFrom(JD_SELECTORS.orgName);
  if (orgEl) return orgEl;

  // Secondary: Open Graph meta tag (present on all Ashby job pages)
  const ogSite = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]');
  if (ogSite) {
    const candidate = cleanText(ogSite.content);
    if (candidate) return candidate;
  }

  // Tertiary: page title pattern "Role at Company | Ashby"
  const title    = document.title;
  const atMatch  = title.match(/\bat\s+(.+?)(?:\s*[|—\-]|\s*$)/i);
  if (atMatch?.[1]) {
    const candidate = cleanText(atMatch[1]);
    if (candidate) return candidate;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Path guards
// ---------------------------------------------------------------------------

function isJobPostingPage(): boolean {
  const { pathname } = window.location;
  // Posting: /:company/:jobId  (2 segments, no trailing /application)
  const segments = pathname.split('/').filter(Boolean);
  return segments.length === 2;
}

function isApplicationPage(): boolean {
  return window.location.pathname.endsWith('/application');
}

// ---------------------------------------------------------------------------
// Form detection — label-text-based (most resilient for React SPAs)
// ---------------------------------------------------------------------------

/**
 * Find an input element by its associated label text.
 * Tries label[for] attribute first, then label > input child.
 */
function findInputByLabel(
  labelText: string,
): HTMLInputElement | HTMLTextAreaElement | null {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('label'));
  for (const label of labels) {
    const text = cleanText(label.innerText);
    if (!text) continue;
    if (!text.toLowerCase().includes(labelText.toLowerCase())) continue;

    // label[for="id"] pattern
    const forId = label.getAttribute('for');
    if (forId) {
      const el = document.getElementById(forId) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el) return el;
    }

    // label > input / label > textarea pattern
    const child = label.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    if (child) return child;
  }
  return null;
}

/**
 * Detect application form fields on Ashby /application pages.
 */
function detectAshbyForm(): FormField[] {
  if (!isApplicationPage()) return [];

  // Guard: confirm a form is actually rendered
  const hasForm = !!document.querySelector('form');
  if (!hasForm) return [];

  const fields: FormField[] = [];

  function probeByLabel(
    profileKey:  string,
    label:       string,
    required:    boolean,
    labelSearch: string,
  ): void {
    const el = findInputByLabel(labelSearch);
    if (!el) return;

    const tag  = el.tagName.toLowerCase();
    const type = (el as HTMLInputElement).type;
    fields.push({
      name:        profileKey,
      type:        tag === 'textarea' ? 'textarea'
                 : type === 'email'   ? 'email'
                 : type === 'tel'     ? 'tel'
                 : 'text',
      label,
      placeholder: (el as HTMLInputElement).placeholder || null,
      required,
      selector:    `#${el.id || ''}`, // best-effort; el is found by reference in fillFields
    });
  }

  probeByLabel('firstName',   'First name',   true,  'first');
  probeByLabel('lastName',    'Last name',     true,  'last');
  probeByLabel('email',       'Email',         true,  'email');
  probeByLabel('phone',       'Phone',         false, 'phone');
  probeByLabel('linkedinUrl', 'LinkedIn URL',  false, 'linkedin');
  probeByLabel('summary',     'Cover letter',  false, 'cover');

  return fields;
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const ashbyAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    const { pathname } = window.location;

    // Apply page — skip JD extraction; ACTIVE_JOB already set from posting visit.
    if (isApplicationPage()) {
      console.debug(`[DVantage][${ADAPTER_NAME}] application page — JD extraction skipped`);
      return null;
    }

    if (!isJobPostingPage()) {
      console.debug(`[DVantage][${ADAPTER_NAME}] not a job posting path (${pathname}); skipping`);
      return null;
    }

    const title = firstMatch(JD_SELECTORS.title);
    if (!title) {
      // React SPA — DOM may not be hydrated yet; debounce will retry.
      console.debug(`[DVantage][${ADAPTER_NAME}] title not found — DOM may not be hydrated yet`);
      return null;
    }

    const company = extractCompany();

    // Location — Ashby renders location as a text div near the title.
    const location = firstMatch(JD_SELECTORS.location);

    // Description — try purpose-built class first, then generic fallback.
    const description =
      firstMatch(JD_SELECTORS.descPrimary, JD_SELECTORS.descTestId, JD_SELECTORS.descFallback) ?? '';

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
    return detectAshbyForm();
  },

  extractFields(): Record<string, string> {
    return {};
  },

  fillFields(profile: UserProfile): AutofillResult {
    if (!isApplicationPage()) return { filled: 0, skipped: [] };

    let filled  = 0;
    const skipped: string[] = [];

    // Value map keyed by profileKey
    const valueMap: Record<string, string | null> = {
      firstName:   profile.firstName   || null,
      lastName:    profile.lastName    || null,
      email:       profile.email       || null,
      phone:       profile.phone,
      linkedinUrl: profile.linkedinUrl,
      summary:     profile.summary,
    };

    // Re-detect fields at fill time — Ashby SPA may have re-rendered since detectForm().
    const labelMap: Record<string, string> = {
      firstName:   'first',
      lastName:    'last',
      email:       'email',
      phone:       'phone',
      linkedinUrl: 'linkedin',
      summary:     'cover',
    };

    const displayLabels: Record<string, string> = {
      firstName:   'First name',
      lastName:    'Last name',
      email:       'Email',
      phone:       'Phone',
      linkedinUrl: 'LinkedIn URL',
      summary:     'Cover letter',
    };

    for (const [key, labelSearch] of Object.entries(labelMap)) {
      const value = valueMap[key] ?? null;
      if (!value) {
        skipped.push(displayLabels[key] ?? key);
        continue;
      }

      const el = findInputByLabel(labelSearch);
      if (!el) {
        // Field not on this form — skip silently (not all Ashby forms have all fields).
        continue;
      }

      fillInput(el, value);
      filled++;
    }

    console.debug(
      `[DVantage][${ADAPTER_NAME}] fillFields complete — filled:${filled} skipped:[${skipped.join(', ')}]`,
    );

    return { filled, skipped };
  },
};
