// ---------------------------------------------------------------------------
// D'Vantage — Greenhouse Site Adapter
//
// Real DOM selectors implemented in D7 (detectJD) and D10 (detectForm + fillFields).
//
// Supported paths:
//   https://boards.greenhouse.io/*       ← classic layout
//   https://job-boards.greenhouse.io/*   ← new layout (data-qa attributes)
//
// Both subdomains render server-side HTML — no SPA concerns.
//
// Autofill (D10):
//   The application form appears on the same page as the job description
//   (new board) or on a linked /application page (classic board).
//   Standard HTML inputs with stable id attributes — most reliable selectors
//   across all Greenhouse customers.
//
// Field map (classic + new board share the same ids):
//   #first_name                              → firstName
//   #last_name                               → lastName
//   #email                                   → email
//   #phone                                   → phone
//   #job_application_linkedin_profile_url    → linkedinUrl
//   #cover_letter (textarea)                 → summary
//
// Fallback selectors for customers with custom field names:
//   input[name*="first"]   input[name*="last"]
//   input[type="email"]    input[type="tel"]
//   input[name*="linkedin"]
// ---------------------------------------------------------------------------

import type {
  AutofillPreviewField,
  AutofillResult,
  ExtractedJob,
  FormField,
  SiteAdapter,
  UserProfile,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADAPTER_NAME = 'greenhouse';

const CLASSIC = {
  title:       'h1.app-title',
  company:     '.company-name',
  location:    '.location',
  locationAlt: '.location-name',
  description: '#content',
  descAlt:     '.content',
} as const;

const NEW_BOARD = {
  title:       '[data-qa="job-title"]',
  location:    '[data-qa="job-location"]',
  description: '[data-qa="job-description"]',
} as const;

const FALLBACK = {
  title:       'h1',
  description: 'main',
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
// Native input setter — React/Vue controlled-input compatibility
// ---------------------------------------------------------------------------

/**
 * Write a value to an input or textarea while triggering React's synthetic
 * event system. Plain `el.value = x` bypasses React's internal state and the
 * component never registers the change.
 *
 * Technique: call the native HTMLInputElement prototype setter directly, then
 * dispatch 'input' + 'change' events with bubbles:true so React's onChange fires.
 */
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

/**
 * Find an input/textarea by a list of selectors in priority order.
 * Returns the first matching, visible element.
 */
function findInput(
  ...selectors: string[]
): HTMLInputElement | HTMLTextAreaElement | null {
  for (const sel of selectors) {
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel);
    if (el) return el;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Company extraction
// ---------------------------------------------------------------------------

function extractCompanyFromTitle(): string | null {
  const title = document.title;

  const applicationPattern = /\bat\s+(.+?)(?:\s*[|—\-]|\s*$)/i;
  const applicationMatch   = title.match(applicationPattern);
  if (applicationMatch?.[1]) {
    const candidate = cleanText(applicationMatch[1]);
    if (candidate) return candidate;
  }

  const jobsAtPattern = /^Jobs\s+at\s+(.+?)(?:\s*[|—\-]|\s*$)/i;
  const jobsAtMatch   = title.match(jobsAtPattern);
  if (jobsAtMatch?.[1]) {
    const candidate = cleanText(jobsAtMatch[1]);
    if (candidate) return candidate;
  }

  const dashPattern = /^(.+?)\s*[—\-]\s*Jobs?\s*$/i;
  const dashMatch   = title.match(dashPattern);
  if (dashMatch?.[1]) {
    const candidate = cleanText(dashMatch[1]);
    if (candidate) return candidate;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Layout-specific JD extraction
// ---------------------------------------------------------------------------

function extractClassic(): ExtractedJob | null {
  const title = firstMatch(CLASSIC.title, FALLBACK.title);
  if (!title) return null;

  return {
    title,
    company:     firstMatch(CLASSIC.company) ?? extractCompanyFromTitle(),
    location:    firstMatch(CLASSIC.location, CLASSIC.locationAlt),
    description: firstMatch(CLASSIC.description, CLASSIC.descAlt, FALLBACK.description) ?? '',
    sourceUrl:   window.location.href,
    extractedAt: new Date().toISOString(),
  };
}

function extractNewBoard(): ExtractedJob | null {
  const title = firstMatch(NEW_BOARD.title, FALLBACK.title);
  if (!title) return null;

  return {
    title,
    company:     extractCompanyFromTitle(),
    location:    firstMatch(NEW_BOARD.location, CLASSIC.location),
    description: firstMatch(NEW_BOARD.description, CLASSIC.description, FALLBACK.description) ?? '',
    sourceUrl:   window.location.href,
    extractedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Form detection helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether an application form is present on the current page.
 * Returns FormField[] describing each detected input.
 *
 * Greenhouse uses stable HTML id attributes across all customers.
 * We probe in priority order — id-based first, then attribute-based fallbacks.
 */
function detectGreenhouseForm(): FormField[] {
  // Quick guard: if there's no form or no Greenhouse-specific input, bail.
  const hasForm = !!document.querySelector(
    '#application-form, #application_form, form.application--form, form[action*="greenhouse"], #apply-form',
  );
  if (!hasForm) return [];

  const fields: FormField[] = [];

  function probe(
    profileKey:  string,
    label:       string,
    required:    boolean,
    ...selectors: string[]
  ): void {
    for (const sel of selectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) {
        const tag  = el.tagName.toLowerCase();
        fields.push({
          name:        profileKey,
          type:        tag === 'textarea' ? 'textarea'
                     : (el as HTMLInputElement).type === 'email' ? 'email'
                     : (el as HTMLInputElement).type === 'tel'   ? 'tel'
                     : 'text',
          label,
          placeholder: (el as HTMLInputElement).placeholder || null,
          required,
          selector:    sel,
        });
        return; // found — move to next field
      }
    }
  }

  probe('firstName',   'First name',    true,  '#first_name',  'input[name*="first"][type="text"]');
  probe('lastName',    'Last name',     true,  '#last_name',   'input[name*="last"][type="text"]');
  probe('email',       'Email',         true,  '#email',       'input[type="email"]');
  probe('phone',       'Phone',         false, '#phone',       'input[type="tel"]', 'input[name*="phone"]');
  probe('linkedinUrl', 'LinkedIn URL',  false,
    '#job_application_linkedin_profile_url',
    'input[name*="linkedin"]',
    'input[placeholder*="LinkedIn"]',
  );
  probe('summary',     'Cover letter',  false,
    '#cover_letter',
    '#job_application_cover_letter',
    'textarea[name*="cover"]',
  );

  return fields;
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const greenhouseAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    const { hostname, pathname } = window.location;

    const isJobPage = /\/jobs\/\d+/.test(pathname);
    if (!isJobPage) {
      console.debug(`[DVantage][${ADAPTER_NAME}] not a job posting path (${pathname}); skipping`);
      return null;
    }

    const isNewBoard = hostname === 'job-boards.greenhouse.io';
    const job        = isNewBoard ? extractNewBoard() : extractClassic();

    if (job) {
      console.debug(`[DVantage][${ADAPTER_NAME}] detected job:`, {
        title: job.title, company: job.company, location: job.location, descLength: job.description.length,
      });
    }

    return job;
  },

  detectForm(): FormField[] {
    return detectGreenhouseForm();
  },

  extractFields(): Record<string, string> {
    // Future: read current form values for capture.
    return {};
  },

  fillFields(profile: UserProfile): AutofillResult {
    const fields  = detectGreenhouseForm();
    if (fields.length === 0) return { filled: 0, skipped: [] };

    let filled  = 0;
    const skipped: string[] = [];

    // Preview fields for logging
    const previewFields: AutofillPreviewField[] = fields
      .filter(f => f.type !== 'unknown' && f.type !== 'file')
      .map(f => ({
        label:      f.label ?? f.name,
        profileKey: f.name as import('../../shared/types').AutofillFieldKey,
        required:   f.required,
      }));

    for (const preview of previewFields) {
      const el = findInput(
        // Find the detected element by selector from the field list
        ...fields
          .filter(f => f.name === preview.profileKey)
          .map(f => f.selector),
      );

      if (!el) {
        skipped.push(preview.label);
        continue;
      }

      let value: string | null = null;

      switch (preview.profileKey) {
        case 'firstName':   value = profile.firstName || null;      break;
        case 'lastName':    value = profile.lastName  || null;      break;
        case 'fullName':    value = `${profile.firstName} ${profile.lastName}`.trim() || null; break;
        case 'email':       value = profile.email     || null;      break;
        case 'phone':       value = profile.phone;                  break;
        case 'linkedinUrl': value = profile.linkedinUrl;            break;
        case 'summary':     value = profile.summary;                break;
        case 'topSkills':   value = profile.topSkills.join(', ') || null; break;
        case 'currentRole': value = profile.currentRole;            break;
        default:            value = null;
      }

      if (!value) {
        skipped.push(preview.label);
        continue;
      }

      fillInput(el, value);
      filled++;
    }

    console.debug(
      `[DVantage][${ADAPTER_NAME}] fillFields complete — filled:${filled} skipped:${skipped.join(', ')}`,
    );

    return { filled, skipped };
  },
};
