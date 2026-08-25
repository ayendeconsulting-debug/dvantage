// ---------------------------------------------------------------------------
// D'Vantage — Lever Site Adapter
//
// D13 Tier A changes:
//   - Import resolveProfileValue from shared/profile-resolver
//   - New field probes: github (urls[GitHub]), location
//   - fillFields() returns SkippedField[] instead of string[]
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

const ADAPTER_NAME = 'lever';

const SELECTORS = {
  title: '.posting-headline h2',
  titleAlt: 'h2',
  company: '.main-header-logo img',
  location: '.posting-categories .location',
  locationAlt: '.location',
  description: '.section-wrapper.page-full-width',
  sections: '.section',
  descAlt: '.posting-content',
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

const nativeInputSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  'value',
)?.set;
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype,
  'value',
)?.set;

function fillInput(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (el instanceof HTMLTextAreaElement) {
    if (nativeTextareaSetter) nativeTextareaSetter.call(el, value);
    else el.value = value;
  } else {
    if (nativeInputSetter) nativeInputSetter.call(el, value);
    else el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function findInput(selector: string): HTMLInputElement | HTMLTextAreaElement | null {
  return document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
}

// ---------------------------------------------------------------------------
// Company extraction
// ---------------------------------------------------------------------------

function extractCompany(): string | null {
  const logoImg = document.querySelector<HTMLImageElement>(SELECTORS.company);
  if (logoImg) {
    const alt = cleanText(logoImg.alt);
    if (alt && alt.length > 2) {
      const stripped = cleanText(alt.replace(/\s+logo$/i, ''));
      if (stripped && !/^logo$/i.test(stripped)) return stripped;
    }
  }

  const title = document.title;
  const atPattern = /\bat\s+(.+?)(?:\s*[|·—\-]|\s*$)/i;
  const atMatch = title.match(atPattern);
  if (atMatch?.[1]) {
    const candidate = cleanText(atMatch[1]);
    if (candidate) return candidate;
  }

  const dashPattern = /^(.+?)\s*[—\-·]\s*.+$/;
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

function extractDescription(): string {
  const wrapper = document.querySelector<HTMLElement>(SELECTORS.description);
  if (wrapper) {
    const text = cleanText(wrapper.innerText);
    if (text) return text;
  }

  const sections = Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.sections));
  if (sections.length > 0) {
    const text = sections
      .map((s) => cleanText(s.innerText))
      .filter((t): t is string => t !== null)
      .join('\n\n');
    if (text.length > 0) return text;
  }

  return firstMatch(SELECTORS.descAlt) ?? '';
}

// ---------------------------------------------------------------------------
// Form detection
// ---------------------------------------------------------------------------

function detectLeverForm(): FormField[] {
  const { pathname } = window.location;
  if (!pathname.endsWith('/apply')) return [];

  const hasForm = !!document.querySelector(
    'form.application-form, form[enctype="multipart/form-data"]',
  );
  if (!hasForm) return [];

  const fields: FormField[] = [];

  function probe(
    profileKey: string,
    label: string,
    required: boolean,
    selector: string,
    type: FormField['type'],
  ): void {
    if (document.querySelector(selector)) {
      fields.push({ name: profileKey, type, label, placeholder: null, required, selector });
    }
  }

  probe('fullName', 'Full name', true, 'input[name="name"]', 'text');
  probe('email', 'Email', true, 'input[name="email"]', 'email');
  probe('phone', 'Phone', false, 'input[name="phone"]', 'tel');
  probe('linkedinUrl', 'LinkedIn URL', false, 'input[name="urls[LinkedIn]"]', 'text');
  probe('github', 'GitHub', false, 'input[name="urls[GitHub]"]', 'text');
  probe('location', 'Location', false, 'input[name="location"]', 'text');
  probe('summary', 'Cover letter', false, 'textarea[name="comments"]', 'textarea');

  return fields;
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const leverAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    const { pathname } = window.location;

    if (pathname.endsWith('/apply')) {
      console.debug(`[DVantage][${ADAPTER_NAME}] apply page — JD extraction skipped`);
      return null;
    }

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

    const job: ExtractedJob = {
      title,
      company: extractCompany(),
      location: firstMatch(SELECTORS.location, SELECTORS.locationAlt),
      description: extractDescription(),
      sourceUrl: window.location.href,
      extractedAt: new Date().toISOString(),
    };

    console.debug(`[DVantage][${ADAPTER_NAME}] detected job:`, {
      title: job.title,
      company: job.company,
      location: job.location,
      descLength: job.description.length,
    });

    return job;
  },

  detectForm(): FormField[] {
    return detectLeverForm();
  },

  extractFields(): Record<string, string> {
    return {};
  },

  fillFields(profile: UserProfile): AutofillResult {
    const fields = detectLeverForm();
    if (fields.length === 0) return { filled: 0, skipped: [] };

    let filled = 0;
    const skipped: SkippedField[] = [];

    for (const field of fields) {
      const value = resolveProfileValue(
        field.name as import('../../shared/types').AutofillFieldKey,
        profile,
      );

      if (!value) {
        skipped.push({
          label: field.label ?? field.name,
          selector: field.selector,
          fieldType: field.type as SkippedField['fieldType'],
          required: field.required,
        });
        continue;
      }

      const el = findInput(field.selector);
      if (!el) {
        skipped.push({
          label: field.label ?? field.name,
          selector: field.selector,
          fieldType: field.type as SkippedField['fieldType'],
          required: field.required,
        });
        continue;
      }

      fillInput(el, value);
      filled++;
    }

    console.debug(
      `[DVantage][${ADAPTER_NAME}] fillFields complete — filled:${filled} skipped:[${skipped.map((s) => s.label).join(', ')}]`,
    );

    return { filled, skipped };
  },
};
