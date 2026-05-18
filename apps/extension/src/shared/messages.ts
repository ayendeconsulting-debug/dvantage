// ---------------------------------------------------------------------------
// D'Vantage Extension – Runtime Message Bus
//
// All cross-context communication (content ↔ background ↔ sidepanel)
// uses these typed messages via chrome.runtime.sendMessage / onMessage.
//
// Convention: message type strings are SCREAMING_SNAKE_CASE.
//
// D10 additions:
//   ContentToBackground:
//     FORM_DETECTED – payload extended with unknownFieldCount + fillableFields
//     FORM_CLEARED  – new; sent when detectForm() returns empty on navigation
//   BackgroundToSidepanel:
//     AUTOFILL_COMPLETE – payload extended with skipped: string[]
//   BackgroundToContent (new union):
//     EXECUTE_AUTOFILL – background SW → content script via chrome.tabs.sendMessage
//
// D11 additions:
//   SidepanelToBackground:
//     REQUEST_PROFILE_UPDATE – settings form → PATCH /v1/extension/profile
//     REQUEST_CAPTURE        – fire-and-forget after autofill complete
//                              → POST /v1/extension/applications
//
// D12 additions:
//   ContentToBackground:
//     FORM_DETECTED payload extended with manualFields:
//       Array<{ label: string; required: boolean }>
//       File inputs (type='file') are routed here by content/index.ts.
//       Stored in ActiveForm.manualFields; rendered as 📎 in AutofillPanel.
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
        fieldCount:        number;
        unknownFieldCount: number;
        pageUrl:           string;
        fillableFields:    AutofillPreviewField[];
        /**
         * D12: file upload fields requiring manual user action.
         * Populated by content/index.ts from FormField[type='file'].
         * Rendered in AutofillPanel with 📎 "Manual upload required" label.
         */
        manualFields:      Array<{ label: string; required: boolean }>;
      };
    }
  | {
      type:    'FORM_CLEARED';
      payload: { pageUrl: string };
    }
  | {
      type:    'FORM_SUBMITTED';
      payload: {
        company:    string | null;
        role:       string | null;
        pageUrl:    string;
        jdSnapshot: string | null;
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
       * BG SW validates, patches API, atomically replaces CACHED_PROFILE.
       */
      type:    'REQUEST_PROFILE_UPDATE';
      payload: {
        phone:       string | null;
        linkedinUrl: string | null;
      };
    }
  | {
      /**
       * Fire-and-forget capture after autofill complete.
       * AutofillPanel sends this immediately after receiving AUTOFILL_COMPLETE.
       * BG SW calls POST /v1/extension/applications and logs the result.
       * No response is awaited – capture failure is silent at the UI level.
       *
       * company and role are nullable because JD detection may have failed.
       * pageUrl is always present (from ACTIVE_FORM.pageUrl).
       */
      type:    'REQUEST_CAPTURE';
      payload: {
        company: string | null;
        role:    string | null;
        pageUrl: string;
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

export type BackgroundToContent =
  | {
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

export type ExternalAck = { ok: true } | { ok: false; error: string };

export type AutofillExecutionResponse =
  | { ok: true;  filled: number; skipped: string[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Union – used in onMessage listeners that receive any message
// ---------------------------------------------------------------------------

export type ExtensionMessage =
  | ContentToBackground
  | SidepanelToBackground
  | BackgroundToSidepanel;

export function isMessageType<T extends ExtensionMessage['type']>(
  msg: ExtensionMessage,
  type: T,
): msg is Extract<ExtensionMessage, { type: T }> {
  return msg.type === type;
}

export type { AutofillResult, AutofillPreviewField, ScoreResult };
