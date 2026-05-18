// ---------------------------------------------------------------------------
// D'Vantage — Ashby Site Adapter
//
// D13 Tier A changes:
//   - Import resolveProfileValue from shared/profile-resolver
//   - New label-based probes: location, github/website
//   - fillFields() returns SkippedField[] instead of string[]
//   - SkippedField.selector is '' for label-based fields (Tier B will use
//     label-text lookup since Ashby generates unstable dynamic input IDs)
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

const ADAPTER_NAME = 'ashby';

const JD_SELECTORS = {
  title:        'h1',
  orgName:      '[data-testid="org-name"]',
  location:     '[data-testid="location"]',
  descPrimary:  '.ashby-job-posting-description',
  descTestId:   '[data-testid="job-description"]',
  descFallback: 'main',
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
  const orgEl = textFrom(JD_SELECTORS.orgName);
  if (orgEl) return orgEl;

  const ogSite = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]');
  if (ogSite) {
    const candidate = cleanText(ogSite.content);
    if (candidate) return candidate;
  }

  const title   = document.title;
  const atMatch = title.match(/\bat\s+(.+?)(?:\s*[|—\-]|\s*$)/i);
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
  const segments = pathname.split('/').filter(Boolean);
  return segments.length === 2;
}

function isApplicationPage(): boolean {
  return window.location.pathname.endsWith('/application');
}

// ---------------------------------------------------------------------------
// Form detection — label-text-based
// ---------------------------------------------------------------------------

function findInputByLabel(
  labelText: string,
): HTMLInputElement | HTMLTextAreaElement | null {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('label'));
  for (const label of labels) {
    const text = cleanText(label.innerText);
    if (!text) continue;
    if (!text.toLowerCase().includes(labelText.toLowerCase())) continue;

    const forId = label.getAttribute('for');
    if (forId) {
      const el = document.getElementById(forId) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el) return el;
    }

    const child = label.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    if (child) return child;
  }
  return null;
}

/**
 * Label-based field definitions for Ashby application forms.
 * D13 Tier A: added location and github/website probes.
 */
const FIELD_DEFS: Array<{
  profileKey:   string;
  displayLabel: string;
  required:     boolean;
  labelSearch:  string;  // text to search in label innerText
}> = [
  { profileKey: 'firstName',   displayLabel: 'First name',       required: true,  labelSearch: 'first' },
  { profileKey: 'lastName',    displayLabel: 'Last name',        required: true,  labelSearch: 'last' },
  { profileKey: 'email',       displayLabel: 'Email',            required: true,  labelSearch: 'email' },
  { profileKey: 'phone',       displayLabel: 'Phone',            required: false, labelSearch: 'phone' },
  { profileKey: 'linkedinUrl', displayLabel: 'LinkedIn URL',     required: false, labelSearch: 'linkedin' },
  { profileKey: 'github',      displayLabel: 'GitHub / Website', required: false, labelSearch: 'github' },
  { profileKey: 'location',    displayLabel: 'Location',         required: false, labelSearch: 'location' },
  { profileKey: 'summary',     displayLabel: 'Cover letter',     required: false, labelSearch: 'cover' },
];

function detectAshbyForm(): FormField[] {
  if (!isApplicationPage()) return [];
  const hasForm = !!document.querySelector('form');
  if (!hasForm) return [];

  const fields: FormField[] = [];

  for (const def of FIELD_DEFS) {
    const el = findInputByLabel(def.labelSearch);
    if (!el) continue;

    const tag  = el.tagName.toLowerCase();
    const type = (el as HTMLInputElement).type;
    fields.push({
      name:        def.profileKey,
      type:        tag === 'textarea' ? 'textarea'
                 : type === 'email'   ? 'email'
                 : type === 'tel'     ? 'tel'
                 : 'text',
      label:       def.displayLabel,
      placeholder: (el as HTMLInputElement).placeholder || null,
      required:    def.required,
      // Label-based adapters don't have stable CSS selectors.
      // Tier B AI fill uses labelSearch fallback when selector is ''.
      selector:    el.id ? `#${el.id}` : '',
    });
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const ashbyAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    const { pathname } = window.location;

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
      console.debug(`[DVantage][${ADAPTER_NAME}] title not found — DOM may not be hydrated yet`);
      return null;
    }

    const job: ExtractedJob = {
      title,
      company:     extractCompany(),
      location:    firstMatch(JD_SELECTORS.location),
      description: firstMatch(JD_SELECTORS.descPrimary, JD_SELECTORS.descTestId, JD_SELECTORS.descFallback) ?? '',
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

    let filled = 0;
    const skipped: SkippedField[] = [];

    for (const def of FIELD_DEFS) {
      const value = resolveProfileValue(
        def.profileKey as import('../../shared/types').AutofillFieldKey,
        profile,
      );

      if (!value) {
        skipped.push({
          label:     def.displayLabel,
          selector:  '',  // label-based — Tier B uses def.labelSearch for fallback
          fieldType: 'text',
          required:  def.required,
        });
        continue;
      }

      // Re-resolve element at fill time — Ashby SPA may have re-rendered
      const el = findInputByLabel(def.labelSearch);
      if (!el) {
        // Field not present in this form — skip silently (not all Ashby forms have all fields)
        console.debug(`[DVantage][${ADAPTER_NAME}] field not found in form: ${def.displayLabel}`);
        continue;
      }

      fillInput(el, value);
      filled++;
    }

    console.debug(
      `[DVantage][${ADAPTER_NAME}] fillFields complete — filled:${filled} skipped:[${skipped.map(s => s.label).join(', ')}]`,
    );

    return { filled, skipped };
  },
};
