// ---------------------------------------------------------------------------
// D'Vantage – Indeed Site Adapter
//
// detectJD: real implementation since D8.
// detectForm / fillFields / observe: real implementation since D12.
//
// D10 change: fillFields return type updated void → AutofillResult.
// D12 change: detectForm + fillFields + observe implemented for Indeed Apply
//             step 1 (same-origin DOM). CSP constraint noted below.
//
// ── Indeed Apply architecture ──────────────────────────────────────────────
//
// Indeed Apply opens as a modal overlay on the job listing page without a
// URL change. This requires observe() (MutationObserver) to trigger detection
// when the modal appears or disappears — same pattern as LinkedIn Easy Apply.
//
// Step 1 of Indeed Apply renders its form fields in the same-origin DOM
// (indeed.com → indeed.com). These fields are accessible to the content script
// and can be filled with the nativeInputSetter pattern.
//
// Step 2+ may involve a cross-origin iframe (apply.indeed.com or
// smartapply.indeed.com). Content scripts cannot access cross-origin iframes
// due to CSP / Same-Origin Policy. Step 2+ is therefore OUT OF SCOPE.
// Users must complete step 2+ manually.
//
// ── Field map (step 1) ────────────────────────────────────────────────────
//
//   Full name OR first + last  → fullName / firstName + lastName
//   Email                      → email
//   Phone                      → phone
//   Resume upload              → resume (📎 manual — type:'file')
//
// ── Modal detection selectors (priority order) ───────────────────────────
//
//   [data-testid="ia-LightningApplyModal"]
//   [data-testid="apply-form-container"]
//   .ia-BasePage
//   div[role="dialog"][aria-label*="apply" i]
//
// Note: Indeed's frontend evolves frequently. If selectors stop matching,
// inspect the DOM of an active apply modal and update this file.
//
// Supported paths (isJobPostingPage guard):
//   /viewjob              ← classic job page
//   /jobs?vjk=<id>        ← SPA job listing with panel
// ---------------------------------------------------------------------------

import type {
  AutofillResult,
  ExtractedJob,
  FormField,
  SiteAdapter,
  UserProfile,
} from '../../shared/types';

const ADAPTER_NAME = 'indeed';

// ---------------------------------------------------------------------------
// JD detection constants (D8 – unchanged)
// ---------------------------------------------------------------------------

const HEADER = {
  titleTestId:    'h1[data-testid="jobsearch-JobInfoHeader-title"]',
  titleClass:     'h1.jobsearch-JobInfoHeader-title',
  companyTestId:  '[data-testid="inlineHeader-companyName"] a',
  companyAttr:    '[data-company-name]',
  locationTestId: '[data-testid="job-location"]',
  locationAlt:    '[data-testid="inlineHeader-companyLocation"]',
} as const;

const DESCRIPTION = {
  primary: '#jobDescriptionText',
  broad:   '.jobsearch-JobComponent-description',
} as const;

const FALLBACK = { title: 'h1' } as const;

// ---------------------------------------------------------------------------
// Modal detection selectors (D12)
// ---------------------------------------------------------------------------

/**
 * Indeed Apply modal selectors in priority order.
 * Try specific data-testid first, fall back to role/aria-label.
 */
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

// ---------------------------------------------------------------------------
// Native input setter – React controlled-input compatibility
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

function extractCompanyFromTitle(): string | null {
  const title        = document.title;
  const withoutSuffix = title.replace(/\s*\|\s*Indeed\s*$/i, '').trim();
  const parts        = withoutSuffix.split(/\s*-\s*/);
  if (parts.length >= 2) {
    const candidate = cleanText(parts[1]);
    if (candidate) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Page guards
// ---------------------------------------------------------------------------

function isJobPostingPage(): boolean {
  const { pathname, search } = window.location;
  if (pathname === '/viewjob') return true;
  if (pathname === '/jobs') {
    return new URLSearchParams(search).has('vjk');
  }
  return false;
}

// ---------------------------------------------------------------------------
// Modal detection (D12)
// ---------------------------------------------------------------------------

/**
 * Detect the Indeed Apply modal element.
 * Returns null when the modal is not open.
 */
function detectIndeedApplyModal(): Element | null {
  for (const sel of MODAL_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Form detection (D12)
// ---------------------------------------------------------------------------

/**
 * Probe for a field inside the modal, scoped to the modal container.
 *
 * File inputs (type='file') are included with type:'file' so that
 * content/index.ts routes them to ActiveForm.manualFields → 📎 in panel.
 *
 * Returns true if a field was pushed.
 */
function probeModal(
  container:  Element,
  fields:     FormField[],
  profileKey: string,
  label:      string,
  required:   boolean,
  ...selectors: string[]
): boolean {
  for (const sel of selectors) {
    const el = container.querySelector<HTMLElement>(sel);
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
      return true;
    }
  }
  return false;
}

/**
 * Detect Indeed Apply step 1 form fields inside the apply modal.
 *
 * Strategy:
 *   1. Modal must be present (detectIndeedApplyModal()).
 *   2. Probe for full-name field first — Indeed Apply step 1 uses a single
 *      name field on many postings. If found, use fullName profileKey.
 *   3. If no combined field, probe for firstName + lastName separately.
 *   4. Probe email, phone, resume (always file type → 📎).
 *
 * Note: selectors use data-testid and name attributes where possible for
 * resilience against class name churn. Attribute-based fallbacks handle
 * employers who customise the apply flow layout.
 */
function detectIndeedForm(): FormField[] {
  if (!isJobPostingPage()) return [];

  const modal = detectIndeedApplyModal();
  if (!modal) return [];

  const fields: FormField[] = [];

  // ── Name field strategy ──────────────────────────────────────────────────
  // Indeed Apply step 1 may show a single "Full name" input or
  // separate "First name" / "Last name" inputs depending on employer config.
  // Probe for combined field first; fall back to split fields.
  const hasCombinedName = !!(
    modal.querySelector('input[name="applicant.name"]') ??
    modal.querySelector('input[data-testid="applicant-name-input"]') ??
    modal.querySelector('input[placeholder*="Full name" i]') ??
    modal.querySelector('input[placeholder*="full name" i]')
  );

  if (hasCombinedName) {
    probeModal(modal, fields, 'fullName', 'Full name', true,
      'input[name="applicant.name"]',
      'input[data-testid="applicant-name-input"]',
      'input[placeholder*="Full name" i]',
      'input[placeholder*="full name" i]',
    );
  } else {
    probeModal(modal, fields, 'firstName', 'First name', true,
      'input[name="applicant.firstName"]',
      'input[data-testid="applicant-first-name-input"]',
      'input[id*="first-name" i]',
      'input[placeholder*="First name" i]',
    );
    probeModal(modal, fields, 'lastName', 'Last name', true,
      'input[name="applicant.lastName"]',
      'input[data-testid="applicant-last-name-input"]',
      'input[id*="last-name" i]',
      'input[placeholder*="Last name" i]',
    );
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  probeModal(modal, fields, 'email', 'Email', true,
    'input[name="applicant.email"]',
    'input[data-testid="applicant-email-input"]',
    'input[type="email"]',
    'input[id*="email" i]',
  );

  // ── Phone ─────────────────────────────────────────────────────────────────
  probeModal(modal, fields, 'phone', 'Phone', false,
    'input[name="applicant.phoneNumber"]',
    'input[data-testid="applicant-phone-input"]',
    'input[type="tel"]',
    'input[id*="phone" i]',
    'input[name*="phone" i]',
  );

  // ── Resume (file → 📎) ───────────────────────────────────────────────────
  // Always type:'file' — browsers block programmatic value setting.
  // content/index.ts routes this to manualFields → 📎 in AutofillPanel.
  probeModal(modal, fields, 'resume', 'Resume', false,
    'input[type="file"]',
    'input[name*="resume" i]',
    'input[accept*="pdf" i]',
  );

  console.debug(
    `[DVantage][${ADAPTER_NAME}] detectForm – fields found: ${fields.length}`,
    fields.map(f => `${f.name}(${f.type})`).join(', '),
  );

  return fields;
}

// ---------------------------------------------------------------------------
// Fill helper (modal-scoped)
// ---------------------------------------------------------------------------

/**
 * Find an input or textarea inside the modal container.
 * Scoped to avoid matching unrelated page inputs.
 */
function findInputInModal(
  modal:     Element,
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
      console.debug(`[DVantage][${ADAPTER_NAME}] not a job posting path (${window.location.pathname}); skipping`);
      return null;
    }

    const title = firstMatch(HEADER.titleTestId, HEADER.titleClass, FALLBACK.title);
    if (!title) {
      console.debug(`[DVantage][${ADAPTER_NAME}] title not found – DOM may not be hydrated yet`);
      return null;
    }

    const company =
      firstMatch(HEADER.companyTestId, HEADER.companyAttr) ??
      extractCompanyFromTitle();

    const location    = firstMatch(HEADER.locationTestId, HEADER.locationAlt);
    const description = firstMatch(DESCRIPTION.primary, DESCRIPTION.broad) ?? '';

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
    const skipped: string[] = [];

    for (const field of fields) {
      // Skip file inputs – browsers block programmatic value setting.
      // These are shown as 📎 in AutofillPanel via manualFields[].
      if (field.type === 'file') continue;

      // Skip unknown fields – no profile mapping.
      if (field.type === 'unknown') {
        skipped.push(field.label ?? field.name);
        continue;
      }

      const el = findInputInModal(modal, field.selector);
      if (!el) {
        skipped.push(field.label ?? field.name);
        continue;
      }

      // Defense-in-depth: never fill a file input regardless of type mapping.
      if (el instanceof HTMLInputElement && el.type === 'file') {
        console.warn(
          `[DVantage][${ADAPTER_NAME}] fillFields(): file input reached fill loop – skipping (${field.label})`,
        );
        continue;
      }

      let value: string | null = null;

      switch (field.name) {
        case 'fullName':    value = `${profile.firstName} ${profile.lastName}`.trim() || null; break;
        case 'firstName':   value = profile.firstName   || null;    break;
        case 'lastName':    value = profile.lastName    || null;    break;
        case 'email':       value = profile.email       || null;    break;
        case 'phone':       value = profile.phone;                  break;
        case 'linkedinUrl': value = profile.linkedinUrl;            break;
        default:            value = null;
      }

      if (!value) {
        skipped.push(field.label ?? field.name);
        continue;
      }

      fillInput(el, value);
      filled++;
    }

    console.debug(
      `[DVantage][${ADAPTER_NAME}] fillFields complete – filled:${filled} skipped:${skipped.join(', ')}`,
    );

    return { filled, skipped };
  },

  /**
   * D12: MutationObserver hook for Indeed Apply modal.
   *
   * Indeed Apply opens/closes without a URL change on job listing pages.
   * We watch document.body for DOM mutations and fire onFormChange() only
   * when the modal's presence actually changes (appear or disappear).
   * This maps to scheduleDetection() in the content script – the standard
   * 1000ms debounce path. Zero new architecture.
   *
   * Note: subtree:true is required because the modal is deeply nested.
   * The state-change guard (nowPresent !== modalPresent) prevents
   * onFormChange() from firing on every minor DOM mutation.
   */
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
