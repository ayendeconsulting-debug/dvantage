// ---------------------------------------------------------------------------
// D'Vantage Extension — Runtime Message Bus
//
// All cross-context communication (content ↔ background ↔ sidepanel)
// uses these typed messages via chrome.runtime.sendMessage / onMessage.
//
// Convention: message type strings are SCREAMING_SNAKE_CASE.
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
  // D5: Sent by AuthGate when TOKEN_EXPIRES_AT is within 7 days.
  // BG SW calls POST /v1/extension/auth/refresh and writes the new
  // expiresAt to storage. On 401, BG SW clears storage → AuthGate
  // transitions to unauthenticated.
  | {
      type: 'REQUEST_REFRESH';
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
