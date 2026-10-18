import type { PlanType, SubscriptionStatus } from '@vantage/database';

// ---------------------------------------------------------------------------
// Current subscription status — returned by GET /v1/subscription
// ---------------------------------------------------------------------------

export interface UsageSummaryDto {
  /** Number of ATS scores run this calendar month. */
  atsScoresUsed: number;
  /** Free tier limit for ATS scores. Null = unlimited. */
  atsScoresLimit: number | null;

  /** Number of optimizations run this calendar month. */
  optimizationsUsed: number;
  /** Free tier limit for optimizations. Null = unlimited. */
  optimizationsLimit: number | null;

  /** Number of job descriptions saved this calendar month. */
  jobsCreatedUsed: number;
  /** Free tier limit for saved jobs. Null = unlimited. */
  jobsCreatedLimit: number | null;
}

export interface SubscriptionStatusDto {
  plan: PlanType;
  /** Null for free plan (no Stripe subscription). */
  status: SubscriptionStatus | null;
  /** Null for free plan. */
  currentPeriodEnd: string | null; // ISO 8601
  cancelAtPeriodEnd: boolean;
  usage: UsageSummaryDto;
}

// ---------------------------------------------------------------------------
// Checkout session — returned by POST /v1/subscription/checkout
// ---------------------------------------------------------------------------

export interface CheckoutSessionDto {
  checkoutUrl: string;
}

// ---------------------------------------------------------------------------
// Portal session — returned by POST /v1/subscription/portal
// ---------------------------------------------------------------------------

export interface PortalSessionDto {
  portalUrl: string;
}
