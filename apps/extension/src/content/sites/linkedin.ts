// ---------------------------------------------------------------------------
// D'Vantage — LinkedIn Jobs Site Adapter
//
// detectJD:    Real implementation from D8 — unchanged.
// detectForm:  Easy Apply modal detection — D11.
// fillFields:  Easy Apply step-1 autofill — D11.
// observe:     MutationObserver — fires scheduleDetection when modal
//              appears or disappears without a URL change — D11.
//
// LinkedIn is a React SPA. Easy Apply opens as a modal overlay without
// triggering pushState, so the standard SPA nav detection in content/index.ts
// cannot detect it. The observe() hook lets the adapter install its own
// MutationObserver that notifies the content script when the modal state
// changes, triggering runDetection() via the existing debounce path.
//
// Easy Apply form strategy:
//   - Target only the modal container — never the surrounding page DOM.
//   - Use label-text-based field lookup (same pattern as Ashby) because
//     LinkedIn generates unstable dynamic IDs on each render.
//   - Fill step-1 contact fields only: first name, last name, email, phone.
//   - Skip file inputs, select/dropdown elements, and any locked/readonly field.
//   - Step 2+ custom questions are left for the user to complete.
//
// Modal selectors (priority order — most specific first):
//   [data-test-modal-id="easy-apply-modal"]
//   .jobs-easy-apply-modal
//   div[role="dialog"][aria-label*="Easy Apply" i]
//   div[role="dialog"][aria-label*="easy apply" i]
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

/**
 * Modal container selectors — tried in order.
 * The modal must be resolved before any field lookup to scope all queries
 * to the modal DOM, preventing false matches on background page fields.
 */
const MODAL_SELECTORS = [
  '[data-test-modal-id="easy-apply-modal"]',
  '.jobs-easy-apply-modal',
  'div[role="dialog"][aria-label*="Easy Apply" i]',
  'div[role="dialog"][aria-label*="easy apply" i]',
] as const;

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
// Company extraction from page title
// ---------------------------------------------------------------------------

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

/**
 * Resolve the Easy Apply modal container element.
 * Returns null if the modal is not currently open.
 */
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

/**
 * Find a fillable input/textarea by its associated label text, scoped to
 * the provided root element (the modal container).
 *
 * Strategy:
 *   1. label[for="id"] → getElementById
 *   2. label > input | label > textarea (nested child)
 *
 * Only returns elements that are not readonly and not disabled.
 */
function findInputByLabel(
  root:        Element,
  labelSearch: string,
): HTMLInputElement | HTMLTextAreaElement | null {
  const labels = Array.from(root.querySelectorAll<HTMLLabelElement>('label'));

  for (const label of labels) {
    const text = cleanText(label.innerText);
    if (!text) continue;
    if (!text.toLowerCase().includes(labelSearch.toLowerCase())) continue;

    // label[for] pattern
    const forId = label.getAttribute('for');
    if (forId) {
      const el = document.getElementById(forId) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el && !el.readOnly && !el.disabled) return el;
    }

    // label > input / label > textarea pattern
    const child = label.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    if (child && !child.readOnly && !child.disabled) return child;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Form detection — scoped to modal
// ---------------------------------------------------------------------------

/**
 * Field definitions for Easy Apply step-1 contact section.
 *
 * Multiple labelSearch values per field handle LinkedIn's varied label text
 * across different form templates and localizations.
 * The first match wins.
 */
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
];

/**
 * Detect Easy Apply form fields inside the modal.
 * Returns an empty array when no modal is open.
 */
function detectLinkedInForm(): FormField[] {
  const modal = resolveModal();
  if (!modal) return [];

  // Guard: confirm at least one input is inside the modal
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
        selector:    el.id ? `#${el.id}` : `[aria-label]`, // best-effort; fillFields re-resolves by reference
      });
      break; // found for this field — move to next
    }
  }

  return fields;
}

// ---------------------------------------------------------------------------
// MutationObserver — modal presence tracking
// ---------------------------------------------------------------------------

/**
 * Install a MutationObserver on document.body that fires the provided callback
 * whenever the Easy Apply modal appears or disappears.
 *
 * The observer tracks a `modalPresent` boolean to suppress redundant callbacks
 * on internal modal DOM mutations (step navigation, field renders, etc.).
 *
 * Returns a cleanup function that disconnects the observer.
 */
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

  observer.observe(document.body, {
    childList: true,   // detect modal mount/unmount
    subtree:   false,  // not subtree — document.body direct children only (performance)
  });

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

    let filled        = 0;
    const skipped: string[] = [];

    // Value map — keyed by profileKey
    const valueMap: Record<string, string | null> = {
      firstName: profile.firstName || null,
      lastName:  profile.lastName  || null,
      email:     profile.email     || null,
      phone:     profile.phone,
    };

    for (const def of FIELD_DEFS) {
      const value = valueMap[def.profileKey] ?? null;

      if (!value) {
        skipped.push(def.displayLabel);
        continue;
      }

      // Re-resolve element at fill time — SPA may have re-rendered since detectForm()
      let el: HTMLInputElement | HTMLTextAreaElement | null = null;
      for (const search of def.labelSearches) {
        el = findInputByLabel(modal, search);
        if (el) break;
      }

      if (!el) {
        // Field not present in this form step — skip silently
        // (not all Easy Apply forms show all fields in step 1)
        console.debug(`[DVantage][${ADAPTER_NAME}] field not found in modal: ${def.displayLabel}`);
        continue;
      }

      // LinkedIn sometimes pre-fills email from the user's account and locks it.
      // Attempting to write to a locked input is harmless but we report it as skipped.
      if (el.readOnly || el.disabled) {
        console.debug(`[DVantage][${ADAPTER_NAME}] field locked — skipping: ${def.displayLabel}`);
        skipped.push(def.displayLabel);
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

  observe(onFormChange: () => void): () => void {
    return observeModalPresence(onFormChange);
  },
};
