// ---------------------------------------------------------------------------
// D'Vantage — Greenhouse Site Adapter
//
// D13 Tier A changes:
//   - Import resolveProfileValue from shared/profile-resolver (replaces inline switch)
//   - New field probes: location, github, currentTitle, currentCompany
//   - fillFields() returns SkippedField[] instead of string[]
//     Each skipped entry includes selector + fieldType for Tier B AI fill.
//   - Iterates over FormField[] directly (not AutofillPreviewField[]) to
//     carry selector info through to SkippedField.
//
// Supported paths:
//   https://boards.greenhouse.io/*
//   https://job-boards.greenhouse.io/*
// ---------------------------------------------------------------------------

import type {
  AutofillResult,
  ExtractedJob,
  FormField,
  SiteAdapter,
  SkippedField,
  UserProfile,
} from '../../shared/types';
import { resolveProfileValue } from '../../shared/profile-resolver';

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
// Text helpers
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
// Form detection
// ---------------------------------------------------------------------------

function detectGreenhouseForm(): FormField[] {
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
        const tag = el.tagName.toLowerCase();
        fields.push({
          name:        profileKey,
          type:        tag === 'textarea'                          ? 'textarea'
                     : (el as HTMLInputElement).type === 'email'  ? 'email'
                     : (el as HTMLInputElement).type === 'tel'    ? 'tel'
                     : (el as HTMLInputElement).type === 'file'   ? 'file'
                     : 'text',
          label,
          placeholder: (el as HTMLInputElement).placeholder || null,
          required,
          selector:    sel,
        });
        return;
      }
    }
  }

  probe('firstName',      'First name',        true,  '#first_name', 'input[name*="first"][type="text"]');
  probe('lastName',       'Last name',         true,  '#last_name',  'input[name*="last"][type="text"]');
  probe('email',          'Email',             true,  '#email',      'input[type="email"]');
  probe('phone',          'Phone',             false, '#phone',      'input[type="tel"]', 'input[name*="phone"]');
  probe('linkedinUrl',    'LinkedIn URL',      false,
    '#job_application_linkedin_profile_url',
    'input[name*="linkedin"]',
    'input[placeholder*="LinkedIn"]',
  );
  probe('github',         'GitHub / Website',  false,
    'input[name*="github"]',
    'input[name*="website"]',
    'input[placeholder*="GitHub"]',
    'input[placeholder*="github"]',
    'input[placeholder*="portfolio"]',
  );
  probe('location',       'Location',          false,
    'input[name*="location"]',
    'input[id*="location"]',
    'input[placeholder*="City"]',
    'input[placeholder*="Location"]',
  );
  probe('currentTitle',   'Current title',     false,
    'input[name*="title"]',
    'input[id*="title"]',
    'input[placeholder*="title" i]',
  );
  probe('currentCompany', 'Current company',   false,
    'input[name*="company"]',
    'input[id*="company"]',
  );
  probe('summary',        'Cover letter',      false,
    '#cover_letter',
    '#job_application_cover_letter',
    'textarea[name*="cover"]',
  );
  // Resume — always type:'file' → routed to manualFields → 📎 in panel
  probe('resume', 'Resume', false,
    '#resume',
    'input[name="resume"]',
    'input[name*="resume"]',
    '#job_application_resume',
    'input[accept*="pdf" i]',
    'input[accept*="doc" i]',
    'input[type="file"]',
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
    return {};
  },

  fillFields(profile: UserProfile): AutofillResult {
    const fields = detectGreenhouseForm();
    if (fields.length === 0) return { filled: 0, skipped: [] };

    let filled = 0;
    const skipped: SkippedField[] = [];

    // Only auto-fill non-file, non-unknown fields
    const fillableFields = fields.filter(f => f.type !== 'unknown' && f.type !== 'file');

    for (const field of fillableFields) {
      // Layer 3 guard — defense-in-depth
      const el = findInput(field.selector);
      if (!el) {
        skipped.push({
          label:     field.label ?? field.name,
          selector:  field.selector,
          fieldType: field.type as SkippedField['fieldType'],
          required:  field.required,
        });
        continue;
      }

      if (el instanceof HTMLInputElement && el.type === 'file') {
        console.warn(`[DVantage][${ADAPTER_NAME}] file input in fill loop — skipping (${field.label})`);
        skipped.push({
          label:     field.label ?? field.name,
          selector:  field.selector,
          fieldType: 'text',
          required:  field.required,
        });
        continue;
      }

      const value = resolveProfileValue(field.name as import('../../shared/types').AutofillFieldKey, profile);

      if (!value) {
        skipped.push({
          label:     field.label ?? field.name,
          selector:  field.selector,
          fieldType: field.type as SkippedField['fieldType'],
          required:  field.required,
        });
        continue;
      }

      fillInput(el, value);
      filled++;
    }

    console.debug(
      `[DVantage][${ADAPTER_NAME}] fillFields complete — filled:${filled} skipped:${skipped.map(s => s.label).join(', ')}`,
    );

    return { filled, skipped };
  },
};
