// ---------------------------------------------------------------------------
// D'Vantage — Indeed Site Adapter
//
// D13 Tier A changes:
//   - Import resolveProfileValue from shared/profile-resolver
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

const ADAPTER_NAME = 'indeed';

const HEADER = {
  titleTestId: 'h1[data-testid="jobsearch-JobInfoHeader-title"]',
  titleClass: 'h1.jobsearch-JobInfoHeader-title',
  companyTestId: '[data-testid="inlineHeader-companyName"] a',
  companyAttr: '[data-company-name]',
  locationTestId: '[data-testid="job-location"]',
  locationAlt: '[data-testid="inlineHeader-companyLocation"]',
} as const;

const DESCRIPTION = {
  primary: '#jobDescriptionText',
  broad: '.jobsearch-JobComponent-description',
} as const;

const FALLBACK = { title: 'h1' } as const;

const MODAL_SELECTORS = [
  '[data-testid="ia-LightningApplyModal"]',
  '[data-testid="apply-form-container"]',
  '.ia-BasePage',
  'div[role="dialog"][aria-label*="apply" i]',
] as const;

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

function extractCompanyFromTitle(): string | null {
  const title = document.title;
  const withoutSuffix = title.replace(/\s*\|\s*Indeed\s*$/i, '').trim();
  const parts = withoutSuffix.split(/\s*-\s*/);
  if (parts.length >= 2) {
    const candidate = cleanText(parts[1]);
    if (candidate) return candidate;
  }
  return null;
}

function isJobPostingPage(): boolean {
  const { pathname, search } = window.location;
  if (pathname === '/viewjob') return true;
  if (pathname === '/jobs') return new URLSearchParams(search).has('vjk');
  return false;
}

function detectIndeedApplyModal(): Element | null {
  for (const sel of MODAL_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Form detection
// ---------------------------------------------------------------------------

function probeModal(
  container: Element,
  fields: FormField[],
  profileKey: string,
  label: string,
  required: boolean,
  ...selectors: string[]
): boolean {
  for (const sel of selectors) {
    const el = container.querySelector<HTMLElement>(sel);
    if (el) {
      const tag = el.tagName.toLowerCase();
      fields.push({
        name: profileKey,
        type:
          tag === 'textarea'
            ? 'textarea'
            : (el as HTMLInputElement).type === 'email'
              ? 'email'
              : (el as HTMLInputElement).type === 'tel'
                ? 'tel'
                : (el as HTMLInputElement).type === 'file'
                  ? 'file'
                  : 'text',
        label,
        placeholder: (el as HTMLInputElement).placeholder || null,
        required,
        selector: sel,
      });
      return true;
    }
  }
  return false;
}

function detectIndeedForm(): FormField[] {
  if (!isJobPostingPage()) return [];

  const modal = detectIndeedApplyModal();
  if (!modal) return [];

  const fields: FormField[] = [];

  const hasCombinedName = !!(
    modal.querySelector('input[name="applicant.name"]') ??
    modal.querySelector('input[data-testid="applicant-name-input"]') ??
    modal.querySelector('input[placeholder*="Full name" i]') ??
    modal.querySelector('input[placeholder*="full name" i]')
  );

  if (hasCombinedName) {
    probeModal(
      modal,
      fields,
      'fullName',
      'Full name',
      true,
      'input[name="applicant.name"]',
      'input[data-testid="applicant-name-input"]',
      'input[placeholder*="Full name" i]',
      'input[placeholder*="full name" i]',
    );
  } else {
    probeModal(
      modal,
      fields,
      'firstName',
      'First name',
      true,
      'input[name="applicant.firstName"]',
      'input[data-testid="applicant-first-name-input"]',
      'input[id*="first-name" i]',
      'input[placeholder*="First name" i]',
    );
    probeModal(
      modal,
      fields,
      'lastName',
      'Last name',
      true,
      'input[name="applicant.lastName"]',
      'input[data-testid="applicant-last-name-input"]',
      'input[id*="last-name" i]',
      'input[placeholder*="Last name" i]',
    );
  }

  probeModal(
    modal,
    fields,
    'email',
    'Email',
    true,
    'input[name="applicant.email"]',
    'input[data-testid="applicant-email-input"]',
    'input[type="email"]',
    'input[id*="email" i]',
  );

  probeModal(
    modal,
    fields,
    'phone',
    'Phone',
    false,
    'input[name="applicant.phoneNumber"]',
    'input[data-testid="applicant-phone-input"]',
    'input[type="tel"]',
    'input[id*="phone" i]',
    'input[name*="phone" i]',
  );

  probeModal(
    modal,
    fields,
    'resume',
    'Resume',
    false,
    'input[type="file"]',
    'input[name*="resume" i]',
    'input[accept*="pdf" i]',
  );

  console.debug(
    `[DVantage][${ADAPTER_NAME}] detectForm — fields found: ${fields.length}`,
    fields.map((f) => `${f.name}(${f.type})`).join(', '),
  );

  return fields;
}

function findInputInModal(
  modal: Element,
  ...selectors: string[]
): HTMLInputElement | HTMLTextAreaElement | null {
  for (const sel of selectors) {
    const el = modal.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel);
    if (el) return el;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const indeedAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    if (!isJobPostingPage()) {
      console.debug(
        `[DVantage][${ADAPTER_NAME}] not a job posting path (${window.location.pathname}); skipping`,
      );
      return null;
    }

    const title = firstMatch(HEADER.titleTestId, HEADER.titleClass, FALLBACK.title);
    if (!title) {
      console.debug(`[DVantage][${ADAPTER_NAME}] title not found — DOM may not be hydrated yet`);
      return null;
    }

    const company =
      firstMatch(HEADER.companyTestId, HEADER.companyAttr) ?? extractCompanyFromTitle();

    const job: ExtractedJob = {
      title,
      company,
      location: firstMatch(HEADER.locationTestId, HEADER.locationAlt),
      description: firstMatch(DESCRIPTION.primary, DESCRIPTION.broad) ?? '',
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
    return detectIndeedForm();
  },

  extractFields(): Record<string, string> {
    return {};
  },

  fillFields(profile: UserProfile): AutofillResult {
    const modal = detectIndeedApplyModal();
    if (!modal) return { filled: 0, skipped: [] };

    const fields = detectIndeedForm();
    if (fields.length === 0) return { filled: 0, skipped: [] };

    let filled = 0;
    const skipped: SkippedField[] = [];

    for (const field of fields) {
      // File inputs: routed to manualFields by content/index.ts; not filled here
      if (field.type === 'file') continue;

      if (field.type === 'unknown') {
        skipped.push({
          label: field.label ?? field.name,
          selector: field.selector,
          fieldType: 'text',
          required: field.required,
        });
        continue;
      }

      const el = findInputInModal(modal, field.selector);
      if (!el) {
        skipped.push({
          label: field.label ?? field.name,
          selector: field.selector,
          fieldType: field.type as SkippedField['fieldType'],
          required: field.required,
        });
        continue;
      }

      if (el instanceof HTMLInputElement && el.type === 'file') {
        console.warn(
          `[DVantage][${ADAPTER_NAME}] fillFields(): file input reached fill loop — skipping (${field.label})`,
        );
        continue;
      }

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

      fillInput(el, value);
      filled++;
    }

    console.debug(
      `[DVantage][${ADAPTER_NAME}] fillFields complete — filled:${filled} skipped:${skipped.map((s) => s.label).join(', ')}`,
    );

    return { filled, skipped };
  },

  observe(onFormChange: () => void): () => void {
    let modalPresent = !!detectIndeedApplyModal();

    const observer = new MutationObserver(() => {
      const nowPresent = !!detectIndeedApplyModal();
      if (nowPresent !== modalPresent) {
        modalPresent = nowPresent;
        onFormChange();
        console.debug(
          `[DVantage][${ADAPTER_NAME}] apply modal ${nowPresent ? 'appeared' : 'disappeared'}`,
        );
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.debug(`[DVantage][${ADAPTER_NAME}] observe() MutationObserver installed`);

    return () => observer.disconnect();
  },
};
