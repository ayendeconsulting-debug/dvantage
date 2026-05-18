// ---------------------------------------------------------------------------
// D'Vantage Extension — Runtime Message Bus
//
// All cross-context communication (content ↔ background ↔ sidepanel)
// uses these typed messages via chrome.runtime.sendMessage / onMessage.
//
// Convention: message type strings are SCREAMING_SNAKE_CASE.
//
// D10 additions:
//   ContentToBackground:
//     FORM_DETECTED — payload extended with unknownFieldCount + fillableFields
//     FORM_CLEARED  — new; sent when detectForm() returns empty on navigation
//   BackgroundToSidepanel:
//     AUTOFILL_COMPLETE — payload extended with skipped: string[]
//   BackgroundToContent (new union):
//     EXECUTE_AUTOFILL — background SW → content script via chrome.tabs.sendMessage
//
// D11 additions:
//   SidepanelToBackground:
//     REQUEST_PROFILE_UPDATE — side panel settings form → PATCH /v1/extension/profile
//                              Background SW validates, patches API, atomically
//                              replaces CACHED_PROFILE, responds with fresh profile.
// ---------------------------------------------------------------------------

import type {
  AutofillPreviewField,
  AutofillResult,
  ExtractedJob,
  ScoreResult,
  UserProfile,
} from './types';

// ---------------------------------------------------------------------------
// Content script → Background
// ---------------------------------------------------------------------------

export type ContentToBackground =
  | {
      type:    'JOB_DETECTED';
      payload: { job: ExtractedJob };
    }
  | {
      type:    'FORM_DETECTED';
      payload: {
        /** Number of fields the adapter's field map covers. */
        fieldCount:        number;
        /** Number of form fields detected but not in the adapter's field map. */
        unknownFieldCount: number;
        /** URL of the page hosting the form (for ACTIVE_FORM storage key). */
        pageUrl:           string;
        /** Field→profile mapping used by AutofillPanel for value preview. */
        fillableFields:    AutofillPreviewField[];
      };
    }
  | {
      /**
       * Sent when detectForm() returns empty fields on a navigation event.
       * Causes the background SW to clear ACTIVE_FORM in chrome.storage.local,
       * which triggers AutofillPanel to hide via storage.onChanged.
       */
      type:    'FORM_CLEARED';
      payload: { pageUrl: string };
    }
  | {
      type:    'FORM_SUBMITTED';
      payload: {
        company:     string | null;
        role:        string | null;
        pageUrl:     string;
        jdSnapshot:  string | null;
      };
    }
  | {
      type:    'AUTH_BRIDGE_TOKEN';
      payload: { token: string; expiresAt: string };
    };

// ---------------------------------------------------------------------------
// Sidepanel → Background
// ---------------------------------------------------------------------------

export type SidepanelToBackground =
  | {
      type:    'REQUEST_SCORE';
      payload: { jobDescription: string; resumeId: string | null };
    }
  | {
      /**
       * Side panel user clicked "Autofill".
       * Background SW fetches (or reads cached) profile → sends EXECUTE_AUTOFILL
       * to the active tab's content script → forwards AUTOFILL_COMPLETE to panel.
       */
      type:    'REQUEST_AUTOFILL';
      payload: { pageUrl: string };
    }
  | {
      type: 'REQUEST_PROFILE';
    }
  | {
      type: 'REQUEST_AUTH_STATUS';
    }
  | {
      type: 'REQUEST_REFRESH';
    }
  | {
      /**
       * Side panel settings form → PATCH /v1/extension/profile.
       *
       * Background SW:
       *   1. Validates payload fields.
       *   2. Calls PATCH /v1/extension/profile with Bearer token.
       *   3. On success: atomically replaces CACHED_PROFILE with fresh response.
       *   4. Responds with { ok: true; profile: UserProfile }.
       *   5. On failure: responds with { ok: false; error: string }.
       *
       * Both phone and linkedinUrl are optional in the payload.
       * Omitting a field keeps the existing stored value.
       * Passing null explicitly clears the field.
       */
      type:    'REQUEST_PROFILE_UPDATE';
      payload: {
        phone:       string | null;
        linkedinUrl: string | null;
      };
    };

// ---------------------------------------------------------------------------
// Background → Sidepanel
// ---------------------------------------------------------------------------

export type BackgroundToSidepanel =
  | {
      type:    'JOB_CONTEXT';
      payload: { job: ExtractedJob | null };
    }
  | {
      type:    'SCORE_RESULT';
      payload: ScoreResult;
    }
  | {
      type:    'SCORE_ERROR';
      payload: { message: string };
    }
  | {
      type:    'AUTH_STATUS';
      payload: { authenticated: boolean; userName: string | null };
    }
  | {
      type:    'PROFILE_RESULT';
      payload: { profile: UserProfile };
    }
  | {
      type:    'AUTOFILL_COMPLETE';
      payload: {
        fieldsFilled: number;
        /** Labels of fields that were skipped (null value or unsupported type). */
        skipped:      string[];
      };
    }
  | {
      type:    'AUTOFILL_ERROR';
      payload: { message: string };
    }
  | {
      type:    'CAPTURE_CONFIRMED';
      payload: { applicationId: string };
    };

// ---------------------------------------------------------------------------
// Background → Content script  (via chrome.tabs.sendMessage)
// ---------------------------------------------------------------------------

/**
 * Messages sent from the background service worker to the content script.
 * Transport: chrome.tabs.sendMessage (not chrome.runtime.sendMessage).
 * The content script must have an onMessage listener registered for these.
 */
export type BackgroundToContent =
  | {
      /**
       * Instructs the content script to run fillFields() using the provided profile.
       * The content script calls the resolved adapter, writes to the DOM, and
       * sends back an AutofillResult via sendResponse.
       */
      type:    'EXECUTE_AUTOFILL';
      payload: { profile: UserProfile };
    };

// ---------------------------------------------------------------------------
// External → Background  (dvantage.ca → chrome.runtime.onMessageExternal)
// ---------------------------------------------------------------------------

export type ExternalToBackground = {
  type:    'DVANTAGE_EXT_TOKEN';
  payload: {
    token:     string;
    expiresAt: string;
  };
};

/** Ack sent back via sendResponse. */
export type ExternalAck = { ok: true } | { ok: false; error: string };

/** Autofill execution result — sent back via sendResponse from content script. */
export type AutofillExecutionResponse =
  | { ok: true;  filled: number; skipped: string[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Union — used in onMessage listeners that receive any message
// ---------------------------------------------------------------------------

export type ExtensionMessage =
  | ContentToBackground
  | SidepanelToBackground
  | BackgroundToSidepanel;

/** Narrow helper — use in onMessage to safely narrow a message by type. */
export function isMessageType<T extends ExtensionMessage['type']>(
  msg: ExtensionMessage,
  type: T,
): msg is Extract<ExtensionMessage, { type: T }> {
  return msg.type === type;
}

// ---------------------------------------------------------------------------
// Re-exports — keep AutofillResult accessible for content script handlers
// ---------------------------------------------------------------------------

export type { AutofillResult, AutofillPreviewField, ScoreResult };
