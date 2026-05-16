// ---------------------------------------------------------------------------
// D'Vantage Extension — Runtime Message Bus
//
// All cross-context communication (content ↔ background ↔ sidepanel)
// uses these typed messages via chrome.runtime.sendMessage / onMessage.
//
// Convention: message type strings are SCREAMING_SNAKE_CASE.
// Payload shapes are minimal — only what the receiver needs.
// Full message handlers implemented in Week 2.
// ---------------------------------------------------------------------------

import type { ExtractedJob, ScoreResult, UserProfile } from './types';

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
      payload: { fieldCount: number; pageUrl: string };
    }
  | {
      type:    'FORM_SUBMITTED';
      payload: { company: string | null; role: string | null; pageUrl: string; jdSnapshot: string | null };
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
      payload: { fieldsFilled: number };
    }
  | {
      type:    'CAPTURE_CONFIRMED';
      payload: { applicationId: string };
    };

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
