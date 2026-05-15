/**
 * Entitlement identifiers.
 *
 * These strings are used in:
 *   - @RequiresEntitlement() NestJS decorator (API enforcement)
 *   - useEntitlement() React hook (UI gating)
 *   - Billing module subscription plan definitions
 *
 * NEVER check plan names directly — always check entitlements.
 * This decouples billing plans from feature gating logic.
 */
export const EntitlementId = {
  // Resume
  RESUME_UPLOAD_UNLIMITED: 'resume:upload:unlimited',
  RESUME_AI_OPTIMIZATION: 'resume:ai:optimization',
  RESUME_AI_OPTIMIZATION_UNLIMITED: 'resume:ai:optimization:unlimited',
  RESUME_EXPORT_PDF: 'resume:export:pdf',
  RESUME_EXPORT_DOCX: 'resume:export:docx',

  // ATS
  ATS_SCAN_UNLIMITED: 'ats:scan:unlimited',
  ATS_SEMANTIC_SCORING: 'ats:scoring:semantic',

  // AI
  AI_COVER_LETTER: 'ai:cover-letter',
  AI_PRIORITY_PROCESSING: 'ai:processing:priority',

  // Applications
  AUTONOMOUS_APPLICATION: 'application:autonomous',
  APPLICATION_TRACKING_UNLIMITED: 'application:tracking:unlimited',

  // Analytics
  ADVANCED_ANALYTICS: 'analytics:advanced',
  SALARY_INTELLIGENCE: 'analytics:salary',

  // Inbox
  INBOX_MONITORING: 'inbox:monitoring',
} as const;

export type EntitlementId = (typeof EntitlementId)[keyof typeof EntitlementId];

/** Entitlements included in the Free plan */
export const FREE_ENTITLEMENTS: ReadonlySet<EntitlementId> = new Set([
  EntitlementId.RESUME_EXPORT_PDF,
  EntitlementId.RESUME_EXPORT_DOCX,
] as EntitlementId[]);

/** Entitlements included in the Premium plan (superset of Free) */
export const PREMIUM_ENTITLEMENTS: ReadonlySet<EntitlementId> = new Set([
  ...FREE_ENTITLEMENTS,
  EntitlementId.RESUME_UPLOAD_UNLIMITED,
  EntitlementId.RESUME_AI_OPTIMIZATION,
  EntitlementId.RESUME_AI_OPTIMIZATION_UNLIMITED,
  EntitlementId.ATS_SCAN_UNLIMITED,
  EntitlementId.ATS_SEMANTIC_SCORING,
  EntitlementId.AI_COVER_LETTER,
  EntitlementId.AI_PRIORITY_PROCESSING,
  EntitlementId.AUTONOMOUS_APPLICATION,
  EntitlementId.APPLICATION_TRACKING_UNLIMITED,
  EntitlementId.ADVANCED_ANALYTICS,
  EntitlementId.SALARY_INTELLIGENCE,
  EntitlementId.INBOX_MONITORING,
] as EntitlementId[]);
