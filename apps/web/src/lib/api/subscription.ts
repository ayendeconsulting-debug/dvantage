/**
 * Subscription API client
 *
 * Typed fetch wrappers for subscription, checkout, and portal endpoints.
 */

const API_BASE =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) ||
  'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types (mirrored from backend DTOs)
// ---------------------------------------------------------------------------

export type PlanType           = 'free' | 'premium';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';

export interface UsageSummary {
  atsScoresUsed:      number;
  atsScoresLimit:     number | null;
  optimizationsUsed:  number;
  optimizationsLimit: number | null;
  jobsCreatedUsed:    number;
  jobsCreatedLimit:   number | null;
}

export interface SubscriptionStatus_ {
  plan:              PlanType;
  status:            SubscriptionStatus | null;
  currentPeriodEnd:  string | null;
  cancelAtPeriodEnd: boolean;
  usage:             UsageSummary;
}

export interface CheckoutSession {
  checkoutUrl: string;
}

export interface PortalSession {
  portalUrl: string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...restInit } = init ?? {};
  const hasBody = restInit.body != null;
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...initHeaders,
    },
    ...restInit,
  });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = await res.json() as { detail?: string; title?: string };
      message = body.detail ?? body.title ?? message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Get current plan, status, and monthly usage counts. */
export async function getSubscription(): Promise<SubscriptionStatus_> {
  return apiFetch<SubscriptionStatus_>('/v1/subscription');
}

/**
 * Create a Stripe Checkout session for upgrading to Premium.
 * Returns a URL — redirect the user to it.
 */
export async function createCheckoutSession(payload: {
  priceId:   string;
  interval?: 'monthly' | 'annual';
}): Promise<CheckoutSession> {
  return apiFetch<CheckoutSession>('/v1/subscription/checkout', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });
}

/**
 * Create a Stripe Customer Portal session.
 * Returns a URL — redirect the user to it.
 */
export async function createPortalSession(): Promise<PortalSession> {
  return apiFetch<PortalSession>('/v1/subscription/portal', {
    method: 'POST',
    body:   '{}',
  });
}
