// ---------------------------------------------------------------------------
// D'Vantage Extension — Runtime Message Bus
//
// All cross-context communication (content ↔ background ↔ sidepanel).
//
// D13 Tier A changes:
//   AutofillExecutionResponse.skipped: string[] → SkippedField[]
//   BackgroundToSidepanel.AUTOFILL_COMPLETE.skipped: string[] → SkippedField[]
//   Enables the side panel to forward SkippedField[] to Tier B AI fill.
// ---------------------------------------------------------------------------

import type {
  AutofillPreviewField,
  AutofillResult,
  ExtractedJob,
  ScoreResult,
  SkippedField,
  UserProfile,
} from './types';

// ---------------------------------------------------------------------------
// Content script → Background
// ---------------------------------------------------------------------------

export type ContentToBackground =
  | {
      type: 'JOB_DETECTED';
      payload: { job: ExtractedJob };
    }
  | {
      type: 'FORM_DETECTED';
      payload: {
        fieldCount: number;
        unknownFieldCount: number;
        pageUrl: string;
        fillableFields: AutofillPreviewField[];
        manualFields: Array<{ label: string; required: boolean }>;
      };
    }
  | {
      type: 'FORM_CLEARED';
      payload: { pageUrl: string };
    }
  | {
      type: 'FORM_SUBMITTED';
      payload: {
        company: string | null;
        role: string | null;
        pageUrl: string;
        jdSnapshot: string | null;
      };
    }
  | {
      type: 'AUTH_BRIDGE_TOKEN';
      payload: { token: string; expiresAt: string };
    };

// ---------------------------------------------------------------------------
// Sidepanel → Background
// ---------------------------------------------------------------------------

export type SidepanelToBackground =
  | {
      type: 'REQUEST_SCORE';
      payload: { jobDescription: string; resumeId: string | null };
    }
  | {
      type: 'REQUEST_AUTOFILL';
      payload: { pageUrl: string };
    }
  | { type: 'REQUEST_PROFILE' }
  | { type: 'REQUEST_AUTH_STATUS' }
  | { type: 'REQUEST_REFRESH' }
  | {
      type: 'REQUEST_PROFILE_UPDATE';
      payload: { phone: string | null; linkedinUrl: string | null };
    }
  | {
      type: 'REQUEST_CAPTURE';
      payload: { company: string | null; role: string | null; pageUrl: string };
    }
  | {
      /** D13 Tier B: sent after Tier A autofill returns skipped fields */
      type: 'REQUEST_AI_FILL';
      payload: { resumeId: string | null; fields: SkippedField[] };
    }
  | {
      /** D13 Tier C: user-initiated form submission from review panel */
      type: 'REQUEST_SUBMIT';
    };

// ---------------------------------------------------------------------------
// Background → Sidepanel
// ---------------------------------------------------------------------------

export type BackgroundToSidepanel =
  | {
      type: 'JOB_CONTEXT';
      payload: { job: ExtractedJob | null };
    }
  | {
      type: 'SCORE_RESULT';
      payload: ScoreResult;
    }
  | {
      type: 'SCORE_ERROR';
      payload: { message: string };
    }
  | {
      type: 'AUTH_STATUS';
      payload: { authenticated: boolean; userName: string | null };
    }
  | {
      type: 'PROFILE_RESULT';
      payload: { profile: UserProfile };
    }
  | {
      type: 'AUTOFILL_COMPLETE';
      payload: {
        fieldsFilled: number;
        /**
         * D13 Tier A: changed from string[] to SkippedField[].
         * Each entry carries selector + fieldType for Tier B AI fill.
         */
        skipped: SkippedField[];
      };
    }
  | {
      type: 'AUTOFILL_ERROR';
      payload: { message: string };
    }
  | {
      type: 'CAPTURE_CONFIRMED';
      payload: { applicationId: string };
    };

// ---------------------------------------------------------------------------
// Background → Content script (via chrome.tabs.sendMessage)
// ---------------------------------------------------------------------------

export type BackgroundToContent =
  | {
      type: 'EXECUTE_AUTOFILL';
      payload: { profile: UserProfile };
    }
  | {
      /** D13 Tier B: AI-generated answers sent to content script for DOM fill */
      type: 'EXECUTE_AI_FILL';
      payload: {
        answers: Array<{ label: string; value: string; selector: string; fieldType: string }>;
      };
    }
  | {
      /** D13 Tier C: click the form submit button */
      type: 'EXECUTE_SUBMIT';
    };

// ---------------------------------------------------------------------------
// External → Background (dvantage.ca → chrome.runtime.onMessageExternal)
// ---------------------------------------------------------------------------

export type ExternalToBackground = {
  type: 'DVANTAGE_EXT_TOKEN';
  payload: { token: string; expiresAt: string };
};

export type ExternalAck = { ok: true } | { ok: false; error: string };

/**
 * Response from content script's EXECUTE_AUTOFILL handler.
 *
 * D13 Tier A: skipped changed from string[] to SkippedField[].
 * The background SW forwards this to the side panel as-is, which then
 * uses it to trigger Tier B AI fill for any non-null skipped entries.
 */
export type AutofillExecutionResponse =
  | { ok: true; filled: number; skipped: SkippedField[] }
  | { ok: false; error: string };

/** D13 Tier B: content script response to EXECUTE_AI_FILL */
export type AiFillExecutionResponse = { ok: true; aiFilled: number } | { ok: false; error: string };

/** D13 Tier C: content script response to EXECUTE_SUBMIT */
export type SubmitExecutionResponse = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Union — used in onMessage listeners
// ---------------------------------------------------------------------------

export type ExtensionMessage = ContentToBackground | SidepanelToBackground | BackgroundToSidepanel;

export function isMessageType<T extends ExtensionMessage['type']>(
  msg: ExtensionMessage,
  type: T,
): msg is Extract<ExtensionMessage, { type: T }> {
  return msg.type === type;
}

export type { AutofillResult, AutofillPreviewField, ScoreResult, SkippedField };
