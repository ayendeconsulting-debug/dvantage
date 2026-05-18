// D'Vantage Content Script — D13 Tier B: EXECUTE_AI_FILL handler added
import type { ContentToBackground, AutofillExecutionResponse, AiFillExecutionResponse, SubmitExecutionResponse } from '../shared/messages';
import type { SiteAdapter, AutofillFieldKey, UserProfile } from '../shared/types';
import { linkedinAdapter }   from './sites/linkedin';
import { indeedAdapter }     from './sites/indeed';
import { greenhouseAdapter } from './sites/greenhouse';
import { leverAdapter }      from './sites/lever';
import { ashbyAdapter }      from './sites/ashby';
import { workdayAdapter }    from './sites/workday';
import { genericAdapter }    from './sites/generic';

const SPA_REDETECT_DELAY_MS = 1_000;

function resolveAdapter(): SiteAdapter {
  const { hostname } = window.location;
  if (hostname.endsWith('linkedin.com'))                                              return linkedinAdapter;
  if (hostname.endsWith('indeed.com'))                                               return indeedAdapter;
  if (hostname === 'boards.greenhouse.io' || hostname === 'job-boards.greenhouse.io') return greenhouseAdapter;
  if (hostname === 'jobs.lever.co')                                                  return leverAdapter;
  if (hostname === 'jobs.ashbyhq.com')                                               return ashbyAdapter;
  if (hostname.endsWith('.myworkdayjobs.com'))                                       return workdayAdapter;
  return genericAdapter;
}

// D13 Tier B: nativeInputSetter helpers for EXECUTE_AI_FILL
const nativeInputSetter    = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,    'value')?.set;
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

function fillInputEl(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (el instanceof HTMLTextAreaElement) { if (nativeTextareaSetter) nativeTextareaSetter.call(el, value); else el.value = value; }
  else                                   { if (nativeInputSetter)    nativeInputSetter.call(el, value);    else el.value = value; }
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function findInputByLabelText(labelText: string): HTMLInputElement | HTMLTextAreaElement | null {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('label'));
  for (const label of labels) {
    if (!(label.innerText ?? '').trim().toLowerCase().includes(labelText.toLowerCase())) continue;
    const forId = label.getAttribute('for');
    if (forId) {
      const el = document.getElementById(forId) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el && !(el instanceof HTMLInputElement && el.type === 'file')) return el;
    }
    const child = label.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    if (child && !(child instanceof HTMLInputElement && child.type === 'file')) return child;
  }
  return null;
}

function sendToBackground(msg: ContentToBackground): void {
  chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
}

function runDetection(): void {
  const adapter = resolveAdapter();
  const job = adapter.detectJD();
  if (job) {
    sendToBackground({ type: 'JOB_DETECTED', payload: { job } });
    console.log('[DVantage Content] JOB_DETECTED sent for:', job.title ?? '(untitled)');
  } else {
    console.log('[DVantage Content] No job detected on', window.location.hostname, window.location.pathname);
  }

  const fields = adapter.detectForm();
  if (fields.length > 0) {
    const fillableFields = fields.filter((f) => f.type !== 'unknown' && f.type !== 'file').map((f) => ({ label: f.label ?? f.name, profileKey: f.name as AutofillFieldKey, required: f.required }));
    const manualFields   = fields.filter((f) => f.type === 'file').map((f) => ({ label: f.label ?? 'File upload', required: f.required }));
    const unknownFieldCount = fields.filter((f) => f.type === 'unknown').length;
    const fieldCount = fillableFields.length + manualFields.length;
    sendToBackground({ type: 'FORM_DETECTED', payload: { fieldCount, unknownFieldCount, pageUrl: window.location.href, fillableFields, manualFields } });
    console.log(`[DVantage Content] FORM_DETECTED — fillable:${fillableFields.length} manual:${manualFields.length} unknown:${unknownFieldCount}`);
  } else {
    sendToBackground({ type: 'FORM_CLEARED', payload: { pageUrl: window.location.href } });
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: AutofillExecutionResponse | AiFillExecutionResponse | SubmitExecutionResponse) => void): boolean | undefined => {
    if (typeof message !== 'object' || message === null) return undefined;
    const msg  = message as Record<string, unknown>;
    const type = msg['type'];

    if (type === 'EXECUTE_AUTOFILL') {
      const payload = msg['payload'];
      if (typeof payload !== 'object' || payload === null || typeof (payload as Record<string, unknown>)['profile'] !== 'object') {
        (sendResponse as (r: AutofillExecutionResponse) => void)({ ok: false, error: 'invalid_payload' });
        return true;
      }
      const profile = (payload as Record<string, unknown>)['profile'] as UserProfile;
      try {
        const adapter = resolveAdapter();
        const result  = adapter.fillFields(profile);
        (sendResponse as (r: AutofillExecutionResponse) => void)({ ok: true, filled: result.filled, skipped: result.skipped });
        console.log(`[DVantage Content] EXECUTE_AUTOFILL — filled:${result.filled} skipped:${result.skipped.length}`);
      } catch (err) {
        (sendResponse as (r: AutofillExecutionResponse) => void)({ ok: false, error: err instanceof Error ? err.message : 'fill_error' });
        console.error('[DVantage Content] EXECUTE_AUTOFILL error:', err);
      }
      return true;
    }

    if (type === 'EXECUTE_AI_FILL') {
      const payload = msg['payload'];
      if (typeof payload !== 'object' || payload === null || !Array.isArray((payload as Record<string, unknown>)['answers'])) {
        (sendResponse as (r: AiFillExecutionResponse) => void)({ ok: false, error: 'invalid_payload' });
        return true;
      }
      const answers = (payload as Record<string, unknown>)['answers'] as Array<{ label: string; value: string; selector: string; fieldType: string }>;
      let aiFilled = 0;
      for (const answer of answers) {
        if (!answer.value?.trim()) continue;
        let el: HTMLInputElement | HTMLTextAreaElement | null = null;
        if (answer.selector) el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(answer.selector);
        if (!el && answer.label) el = findInputByLabelText(answer.label);
        if (!el) continue;
        if (el instanceof HTMLInputElement && el.type === 'file') continue;
        if (el.readOnly || el.disabled) continue;
        fillInputEl(el, answer.value.trim());
        aiFilled++;
      }
      (sendResponse as (r: AiFillExecutionResponse) => void)({ ok: true, aiFilled });
      console.log(`[DVantage Content] EXECUTE_AI_FILL — aiFilled:${aiFilled}/${answers.length}`);
      return true;
    }


    if (type === 'EXECUTE_SUBMIT') {
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button[aria-label*="submit" i]',
        'button[aria-label*="apply" i]',
        'button[aria-label*="Submit application" i]',
        'button[data-control-name="submit_unify_btn_enabled"]',
      ];
      let submitEl: HTMLButtonElement | HTMLInputElement | null = null;
      for (const sel of submitSelectors) {
        const el = document.querySelector<HTMLButtonElement | HTMLInputElement>(sel);
        if (el && !el.disabled) { submitEl = el; break; }
      }
      if (!submitEl) {
        (sendResponse as (r: SubmitExecutionResponse) => void)({ ok: false, error: 'submit_button_not_found' });
        console.warn('[DVantage Content] EXECUTE_SUBMIT — no submit button found');
        return true;
      }
      submitEl.click();
      (sendResponse as (r: SubmitExecutionResponse) => void)({ ok: true });
      console.log('[DVantage Content] EXECUTE_SUBMIT — clicked:', submitEl.textContent?.trim().slice(0, 30));
      return true;
    }

    return undefined;
  },
);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDetection(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { debounceTimer = null; runDetection(); }, SPA_REDETECT_DELAY_MS);
}

const originalPushState    = history.pushState.bind(history);
const originalReplaceState = history.replaceState.bind(history);
history.pushState    = function (...args: Parameters<typeof history.pushState>):    void { originalPushState(...args);    scheduleDetection(); };
history.replaceState = function (...args: Parameters<typeof history.replaceState>): void { originalReplaceState(...args); scheduleDetection(); };
window.addEventListener('popstate', scheduleDetection);

const adapter = resolveAdapter();
if (typeof adapter.observe === 'function') {
  adapter.observe(scheduleDetection);
  console.log('[DVantage Content] observe() hook installed for:', window.location.hostname);
}

runDetection();

const adapterName =
  window.location.hostname.endsWith('linkedin.com')         ? 'linkedin'   :
  window.location.hostname.endsWith('indeed.com')           ? 'indeed'     :
  window.location.hostname === 'boards.greenhouse.io' ||
  window.location.hostname === 'job-boards.greenhouse.io'   ? 'greenhouse' :
  window.location.hostname === 'jobs.lever.co'              ? 'lever'      :
  window.location.hostname === 'jobs.ashbyhq.com'           ? 'ashby'      :
  window.location.hostname.endsWith('.myworkdayjobs.com')   ? 'workday'    : 'generic';

console.log('[DVantage Content] Dispatcher ready | adapter:', adapterName, '| host:', window.location.hostname);
