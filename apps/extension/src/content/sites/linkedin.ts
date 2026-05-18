// ---------------------------------------------------------------------------
// D'Vantage — LinkedIn Jobs Site Adapter
//
// D13 Tier A changes:
//   - Import resolveProfileValue from shared/profile-resolver
//   - New Easy Apply field probe: location/city
//   - fillFields() returns SkippedField[]
//   - Auto-advance: after filling step 1, schedules a click of the
//     "Continue to next step" button (800ms delay, guarded on filled > 0)
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

const ADAPTER_NAME = 'linkedin';

const TOP_CARD = {
  title:           '.job-details-jobs-unified-top-card__job-title h1',
  companyLink:     '.job-details-jobs-unified-top-card__company-name a',
  companyWrapper:  '.job-details-jobs-unified-top-card__company-name',
  locationPrimary: '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
  locationBullet:  '.job-details-jobs-unified-top-card__bullet',
} as const;

const DESCRIPTION = {
  inner: '.jobs-description__content .jobs-description-content__text',
  outer: '#job-details',
  broad: '.jobs-description',
} as const;

const FALLBACK = { title: 'h1' } as const;

const MODAL_SELECTORS = [
  '[data-test-modal-id="easy-apply-modal"]',
  '.jobs-easy-apply-modal',
  'div[role="dialog"][aria-label*="Easy Apply" i]',
  'div[role="dialog"][aria-label*="easy apply" i]',
] as const;

// Next button selectors — tried in order
const NEXT_BUTTON_SELECTORS = [
  'button[aria-label="Continue to next step"]',
  '[data-easy-apply-next-button]',
  'button[aria-label*="next step" i]',
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

function extractCompanyFromTitle(): string | null {
  const title = document.title;
  const pipePattern = /^.+?\s*\|\s*(.+?)\s*\|\s*LinkedIn\s*$/i;
  const pipeMatch   = title.match(pipePattern);
  if (pipeMatch?.[1]) {
    const candidate = cleanText(pipeMatch[1]);
    if (candidate) return candidate;
  }
  const atPattern = /\bat\s+(.+?)\s*(?:\||\s*$)/i;
  const atMatch   = title.match(atPattern);
  if (atMatch?.[1]) {
    const candidate = cleanText(atMatch[1]);
    if (candidate) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Modal resolution
// ---------------------------------------------------------------------------

function resolveModal(): Element | null {
  for (const sel of MODAL_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Label-based field lookup — scoped to modal
// ---------------------------------------------------------------------------

function findInputByLabel(
  root:        Element,
  labelSearch: string,
): HTMLInputElement | HTMLTextAreaElement | null {
  const labels = Array.from(root.querySelectorAll<HTMLLabelElement>('label'));

  for (const label of labels) {
    const text = cleanText(label.innerText);
    if (!text) continue;
    if (!text.toLowerCase().includes(labelSearch.toLowerCase())) continue;

    const forId = label.getAttribute('for');
    if (forId) {
      const el = document.getElementById(forId) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el && !el.readOnly && !el.disabled) return el;
    }

    const child = label.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    if (child && !child.readOnly && !child.disabled) return child;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Field definitions for Easy Apply step 1
// D13 Tier A: added location/city
// ---------------------------------------------------------------------------

const FIELD_DEFS: Array<{
  profileKey:    string;
  displayLabel:  string;
  required:      boolean;
  labelSearches: string[];
}> = [
  {
    profileKey:    'firstName',
    displayLabel:  'First name',
    required:      true,
    labelSearches: ['first name', 'first'],
  },
  {
    profileKey:    'lastName',
    displayLabel:  'Last name',
    required:      true,
    labelSearches: ['last name', 'last', 'surname', 'family name'],
  },
  {
    profileKey:    'email',
    displayLabel:  'Email',
    required:      true,
    labelSearches: ['email'],
  },
  {
    profileKey:    'phone',
    displayLabel:  'Phone number',
    required:      false,
    labelSearches: ['mobile phone', 'phone number', 'phone'],
  },
  {
    profileKey:    'location',
    displayLabel:  'City',
    required:      false,
    labelSearches: ['city', 'location', 'city, state'],
  },
];

// ---------------------------------------------------------------------------
// Form detection
// ---------------------------------------------------------------------------

function detectLinkedInForm(): FormField[] {
  const modal = resolveModal();
  if (!modal) return [];

  const hasInputs = !!modal.querySelector('input, textarea');
  if (!hasInputs) return [];

  const fields: FormField[] = [];

  for (const def of FIELD_DEFS) {
    for (const search of def.labelSearches) {
      const el = findInputByLabel(modal, search);
      if (!el) continue;

      const tag  = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type ?? 'text';

      fields.push({
        name:        def.profileKey,
        type:        tag === 'textarea' ? 'textarea'
                   : type === 'email'   ? 'email'
                   : type === 'tel'     ? 'tel'
                   : 'text',
        label:       def.displayLabel,
        placeholder: (el as HTMLInputElement).placeholder || null,
        required:    def.required,
        selector:    el.id ? `#${el.id}` : '',
      });
      break;
    }
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Auto-advance: click "Next" after step 1 fill (D13 Tier A)
//
// Scheduled with an 800ms delay after fillInput calls complete, giving
// React time to reconcile the controlled inputs before the click fires.
// Only fires when at least one field was filled (guard: filled > 0).
// ---------------------------------------------------------------------------

function scheduleAutoAdvance(modal: Element): void {
  setTimeout(() => {
    for (const sel of NEXT_BUTTON_SELECTORS) {
      const btn = modal.querySelector<HTMLButtonElement>(sel);
      if (btn && !btn.disabled) {
        console.debug(`[DVantage][${ADAPTER_NAME}] auto-advancing to step 2 via:`, sel);
        btn.click();
        return;
      }
    }
    // Fallback: last non-Back button in the modal footer
    const footer = modal.querySelector('footer, [class*="footer"]');
    if (footer) {
      const buttons = Array.from(footer.querySelectorAll<HTMLButtonElement>('button[type="button"]'));
      const nextBtn = buttons.at(-1);
      if (nextBtn && !nextBtn.disabled) {
        console.debug(`[DVantage][${ADAPTER_NAME}] auto-advancing via footer last button`);
        nextBtn.click();
      }
    }
  }, 800);
}

// ---------------------------------------------------------------------------
// MutationObserver
// ---------------------------------------------------------------------------

function observeModalPresence(onChange: () => void): () => void {
  let modalPresent = !!resolveModal();

  const observer = new MutationObserver(() => {
    const nowPresent = !!resolveModal();
    if (nowPresent !== modalPresent) {
      modalPresent = nowPresent;
      console.debug(
        `[DVantage][${ADAPTER_NAME}] modal ${nowPresent ? 'opened' : 'closed'} — triggering detection`,
      );
      onChange();
    }
  });

  observer.observe(document.body, { childList: true, subtree: false });

  return (): void => {
    observer.disconnect();
    console.debug(`[DVantage][${ADAPTER_NAME}] MutationObserver disconnected`);
  };
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const linkedinAdapter: SiteAdapter = {
  detectJD(): ExtractedJob | null {
    const { pathname } = window.location;
    const isJobPage = /\/jobs\/view\/\d+/.test(pathname);
    if (!isJobPage) {
      console.debug(`[DVantage][${ADAPTER_NAME}] not a job posting path (${pathname}); skipping`);
      return null;
    }

    const title = firstMatch(TOP_CARD.title, FALLBACK.title);
    if (!title) {
      console.debug(`[DVantage][${ADAPTER_NAME}] title not found — DOM may not be hydrated yet`);
      return null;
    }

    const company =
      firstMatch(TOP_CARD.companyLink, TOP_CARD.companyWrapper) ??
      extractCompanyFromTitle();

    const location    = firstMatch(TOP_CARD.locationPrimary, TOP_CARD.locationBullet);
    const description = firstMatch(DESCRIPTION.inner, DESCRIPTION.outer, DESCRIPTION.broad) ?? '';

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
    return detectLinkedInForm();
  },

  extractFields(): Record<string, string> {
    return {};
  },

  fillFields(profile: UserProfile): AutofillResult {
    const modal = resolveModal();
    if (!modal) {
      console.debug(`[DVantage][${ADAPTER_NAME}] fillFields — modal not open, aborting`);
      return { filled: 0, skipped: [] };
    }

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
          selector:  '',   // label-based — Tier B uses labelSearch fallback
          fieldType: 'text',
          required:  def.required,
        });
        continue;
      }

      let el: HTMLInputElement | HTMLTextAreaElement | null = null;
      for (const search of def.labelSearches) {
        el = findInputByLabel(modal, search);
        if (el) break;
      }

      if (!el) {
        console.debug(`[DVantage][${ADAPTER_NAME}] field not found in modal: ${def.displayLabel}`);
        continue;
      }

      if (el.readOnly || el.disabled) {
        console.debug(`[DVantage][${ADAPTER_NAME}] field locked — skipping: ${def.displayLabel}`);
        skipped.push({
          label:     def.displayLabel,
          selector:  '',
          fieldType: 'text',
          required:  def.required,
        });
        continue;
      }

      fillInput(el, value);
      filled++;
    }

    console.debug(
      `[DVantage][${ADAPTER_NAME}] fillFields complete — filled:${filled} skipped:[${skipped.map(s => s.label).join(', ')}]`,
    );

    // Auto-advance to step 2 after step 1 fill — only if at least one field was filled
    if (filled > 0) {
      scheduleAutoAdvance(modal);
    }

    return { filled, skipped };
  },

  observe(onFormChange: () => void): () => void {
    return observeModalPresence(onFormChange);
  },
};
