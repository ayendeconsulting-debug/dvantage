import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { uuidv7 } from 'uuidv7';

import { subscriptions, usageEvents, type DatabaseClient } from '@vantage/database';
import type { PlanType, SubscriptionStatus, UsageEventType } from '@vantage/database';
import { DATABASE_CLIENT } from '../database/database.module';
import type { AuthUser } from '../auth/auth.service';
import { PaymentRequiredException } from './exceptions/payment-required.exception';
import type {
  SubscriptionStatusDto,
  CheckoutSessionDto,
  PortalSessionDto,
} from './dto/subscription-response.dto';

// ---------------------------------------------------------------------------
// Free tier limits (per calendar month)
// ---------------------------------------------------------------------------

const FREE_LIMITS = {
  ats_score: 3,
  optimization: 1,
  job_created: 3,
} as const satisfies Record<UsageEventType, number>;

// ---------------------------------------------------------------------------
// Billing intervals → server-configured Stripe prices
// ---------------------------------------------------------------------------

export type BillingInterval = 'monthly' | 'annual';

/**
 * The ONLY prices this application will ever check out against.
 *
 * Resolved from environment at call time rather than module load, so a
 * corrected secret takes effect on the next request instead of needing a
 * redeploy — and so a missing one fails loudly at checkout with a message
 * that names the variable, rather than silently at boot.
 */
const PRICE_ID_ENV: Record<BillingInterval, string> = {
  monthly: 'STRIPE_PRICE_ID_PREMIUM_MONTHLY',
  annual: 'STRIPE_PRICE_ID_PREMIUM_ANNUAL',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly stripe: Stripe;

  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseClient) {
    const secretKey = process.env['STRIPE_SECRET_KEY'] ?? '';
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    });
  }

  // ---------------------------------------------------------------------------
  // GET /v1/subscription
  // ---------------------------------------------------------------------------

  async getSubscriptionStatus(user: AuthUser): Promise<SubscriptionStatusDto> {
    const sub = await this.getOrCreateSubscription(user.id);

    const [atsUsed, optUsed, jobsUsed] = await Promise.all([
      this.countThisMonth(user.id, 'ats_score'),
      this.countThisMonth(user.id, 'optimization'),
      this.countThisMonth(user.id, 'job_created'),
    ]);

    const isPremium = sub.plan === 'premium';

    return {
      plan: sub.plan,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      usage: {
        atsScoresUsed: atsUsed,
        atsScoresLimit: isPremium ? null : FREE_LIMITS.ats_score,
        optimizationsUsed: optUsed,
        optimizationsLimit: isPremium ? null : FREE_LIMITS.optimization,
        jobsCreatedUsed: jobsUsed,
        jobsCreatedLimit: isPremium ? null : FREE_LIMITS.job_created,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Entitlement checks — called by AtsScoreService, OptimizeService, JobService
  // ---------------------------------------------------------------------------

  async assertCanScore(userId: string): Promise<void> {
    await this.assertQuota(userId, 'ats_score', 'ATS score');
  }

  async assertCanOptimize(userId: string): Promise<void> {
    await this.assertQuota(userId, 'optimization', 'AI optimization');
  }

  async assertCanCreateJob(userId: string): Promise<void> {
    await this.assertQuota(userId, 'job_created', 'saved job description');
  }

  /**
   * Record a metered usage event.
   * Called AFTER assertCan* confirms the action is allowed.
   * The call site is responsible for transactional safety.
   */
  async recordUsage(userId: string, eventType: UsageEventType): Promise<void> {
    await this.db.insert(usageEvents).values({
      id: uuidv7(),
      userId,
      eventType,
      createdAt: new Date(),
    });
    this.logger.log(`Usage recorded — user=${userId} type=${eventType}`);
  }

  // ---------------------------------------------------------------------------
  // POST /v1/subscription/checkout
  // ---------------------------------------------------------------------------

  /**
   * Create a Stripe Checkout session for the given billing interval.
   *
   * The caller names an interval; this method resolves the price from server
   * configuration. It never accepts a price ID from the client — see the note
   * on checkoutBodySchema in subscription.controller.ts.
   */
  async createCheckoutSession(
    user: AuthUser,
    interval: BillingInterval,
  ): Promise<CheckoutSessionDto> {
    const priceId = this.resolvePriceId(interval);
    const sub = await this.getOrCreateSubscription(user.id);
    const appUrl = process.env['APP_URL'] ?? 'http://localhost:3000';
    const customerId = await this.getOrCreateStripeCustomer(user, sub.id);

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard/settings/billing?success=1`,
      cancel_url: `${appUrl}/dashboard/settings/billing?canceled=1`,
      allow_promotion_codes: true,
      metadata: { userId: user.id, subscriptionRowId: sub.id },
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    this.logger.log(`Checkout session created — user=${user.id} price=${priceId}`);
    return { checkoutUrl: session.url };
  }

  // ---------------------------------------------------------------------------
  // POST /v1/subscription/portal
  // ---------------------------------------------------------------------------

  async createPortalSession(user: AuthUser): Promise<PortalSessionDto> {
    const sub = await this.getOrCreateSubscription(user.id);

    if (!sub.stripeCustomerId) {
      throw new NotFoundException(
        'No billing account found. Please subscribe first before managing your subscription.',
      );
    }

    const appUrl = process.env['APP_URL'] ?? 'http://localhost:3000';
    const session = await this.stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl}/dashboard/settings/billing`,
    });

    this.logger.log(`Portal session created — user=${user.id}`);
    return { portalUrl: session.url };
  }

  // ---------------------------------------------------------------------------
  // Webhook helpers — called by StripeWebhookController
  // ---------------------------------------------------------------------------

  async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.['userId'];
    const subscriptionId = session.subscription as string | null;
    const customerId = session.customer as string | null;

    if (!userId || !subscriptionId || !customerId) {
      this.logger.warn('checkout.session.completed missing metadata — skipping');
      return;
    }

    const stripeSub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const paidPriceId = stripeSub.items.data[0]?.price.id ?? null;

    // Verify the subscription is actually for a price we sell before granting
    // Premium. Previously `plan: 'premium'` was hardcoded regardless of what
    // was purchased, which is what made the client-supplied priceId hole
    // exploitable. Checkout can no longer pass an arbitrary price, but a
    // subscription can still reach us from the Stripe Dashboard or a support
    // action, so verify here too.
    //
    // Record the subscription either way — losing the Stripe linkage would be
    // worse than a wrong plan, and it leaves an auditable row. Only the
    // entitlement is withheld.
    const isKnownPrice = this.isKnownPremiumPrice(paidPriceId);
    if (!isKnownPrice) {
      this.logger.error(
        `checkout.session.completed for an UNRECOGNISED price — user=${userId} ` +
          `price=${paidPriceId ?? 'null'}. Recording the subscription but NOT granting ` +
          `Premium. Investigate: this should not happen through the normal checkout flow.`,
      );
    }

    await this.db
      .update(subscriptions)
      .set({
        plan: isKnownPrice ? 'premium' : 'free',
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: paidPriceId,
        status: stripeSub.status as SubscriptionStatus,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, userId));

    this.logger.log(
      `Subscription recorded — user=${userId} price=${paidPriceId ?? 'null'} ` +
        `plan=${isKnownPrice ? 'premium' : 'free (unrecognised price)'}`,
    );
  }

  /**
   * Handles customer.subscription.updated.
   *
   * Stripe does NOT guarantee event delivery order. In a race condition,
   * this event can fire BEFORE checkout.session.completed is processed,
   * meaning our DB row may not yet have stripeSubscriptionId stamped.
   *
   * Strategy:
   *   1. Primary path   — match by stripeSubscriptionId (steady-state, fast path)
   *   2. Fallback path  — match by stripeCustomerId (race condition recovery)
   *      Also writes stripeSubscriptionId so future events hit the primary path.
   *   3. If both miss   — log error, return 200 (do NOT throw — prevents Stripe retry storm)
   */
  async handleSubscriptionUpdated(stripeSub: Stripe.Subscription): Promise<void> {
    const isActive = ['active', 'trialing'].includes(stripeSub.status);
    const customerId = stripeSub.customer as string;

    const patch = {
      plan: (isActive ? 'premium' : 'free') as PlanType,
      // Always stamp stripeSubscriptionId — critical for the fallback path to
      // ensure future events match via the primary path.
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: stripeSub.items.data[0]?.price.id ?? null,
      status: stripeSub.status as SubscriptionStatus,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      updatedAt: new Date(),
    };

    // -- Primary path: match by stripeSubscriptionId (steady-state) -----------
    const bySubId = await this.db
      .update(subscriptions)
      .set(patch)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSub.id))
      .returning({ id: subscriptions.id });

    if (bySubId.length > 0) {
      this.logger.log(
        `Subscription updated — stripe_id=${stripeSub.id} status=${stripeSub.status}`,
      );
      return;
    }

    // -- Fallback path: match by stripeCustomerId (race condition recovery) ---
    this.logger.warn(
      `handleSubscriptionUpdated: no row matched by subscription ID — ` +
        `falling back to customer ID (likely race condition). ` +
        `stripe_sub=${stripeSub.id} stripe_customer=${customerId}`,
    );

    const byCustomerId = await this.db
      .update(subscriptions)
      .set(patch)
      .where(eq(subscriptions.stripeCustomerId, customerId))
      .returning({ id: subscriptions.id });

    if (byCustomerId.length === 0) {
      // Both paths missed — event arrived before checkout created the customer.
      // This should not happen in normal flow; investigate if this log appears.
      this.logger.error(
        `handleSubscriptionUpdated: no subscription row found for ` +
          `stripe_customer=${customerId} stripe_sub=${stripeSub.id} — event dropped. ` +
          `This indicates checkout.session.completed has not yet been processed.`,
      );
      // Return normally — do NOT throw. Throwing here would cause Stripe to
      // receive a 500 and retry, which will not help if the row doesn't exist.
      return;
    }

    this.logger.log(
      `Subscription updated via customer fallback — ` +
        `customer=${customerId} status=${stripeSub.status}`,
    );
  }

  async handleSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({
        plan: 'free',
        status: 'canceled',
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, stripeSub.id));

    this.logger.log(`Subscription canceled — stripe_id=${stripeSub.id}`);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns existing subscription row, or creates a free-plan row lazily.
   * Using upsert-style insert with ON CONFLICT DO NOTHING ensures idempotency
   * even under concurrent requests.
   */
  async getOrCreateSubscription(userId: string) {
    const [existing] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (existing) return existing;

    const id = uuidv7();
    const now = new Date();

    await this.db
      .insert(subscriptions)
      .values({
        id,
        userId,
        plan: 'free',
        cancelAtPeriodEnd: false,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    // Re-fetch after insert (handles race where another request created it first)
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (!row)
      throw new Error(`SubscriptionService: failed to create subscription for user=${userId}`);
    return row;
  }

  private async assertQuota(
    userId: string,
    eventType: UsageEventType,
    label: string,
  ): Promise<void> {
    const sub = await this.getOrCreateSubscription(userId);

    // Premium users have no limits
    if (sub.plan === 'premium') return;

    const limit = FREE_LIMITS[eventType];
    const used = await this.countThisMonth(userId, eventType);

    if (used >= limit) {
      const appUrl = process.env['APP_URL'] ?? 'http://localhost:3000';
      throw new PaymentRequiredException(
        `You have used ${used} of ${limit} free ${label}${limit !== 1 ? 's' : ''} this month. Upgrade to Premium for unlimited access.`,
        `${appUrl}/dashboard/settings/billing`,
      );
    }
  }

  private async countThisMonth(userId: string, eventType: UsageEventType): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          eq(usageEvents.eventType, eventType),
          sql`date_trunc('month', ${usageEvents.createdAt}) = date_trunc('month', now())`,
        ),
      );

    return rows[0]?.count ?? 0;
  }

  /**
   * Map a billing interval to its configured Stripe price ID.
   *
   * Throws rather than falling back. A missing price secret must break
   * checkout visibly — the alternative is charging someone the wrong amount,
   * or the previous behaviour, where the client chose its own price.
   */
  private resolvePriceId(interval: BillingInterval): string {
    const envVar = PRICE_ID_ENV[interval];
    const priceId = process.env[envVar];

    if (!priceId) {
      this.logger.error(`${envVar} is not set — cannot create a checkout session.`);
      throw new Error(
        `Billing is misconfigured: ${envVar} is not set. Set it with ` +
          `\`fly secrets set ${envVar}=price_... --app dvantage-api\`.`,
      );
    }
    if (!priceId.startsWith('price_')) {
      this.logger.error(`${envVar} does not look like a Stripe price ID: "${priceId}"`);
      throw new Error(`Billing is misconfigured: ${envVar} must start with "price_".`);
    }

    return priceId;
  }

  /**
   * True when a Stripe price ID is one this application actually sells.
   *
   * Second line of defence behind resolvePriceId. Checkout can only be started
   * with a configured price now, but a subscription can also reach us from
   * outside that path — created in the Stripe Dashboard, migrated from another
   * account, or attached to a customer by support. Verifying at grant time
   * means an unrecognised price never silently confers Premium.
   */
  private isKnownPremiumPrice(priceId: string | null | undefined): boolean {
    if (!priceId) return false;
    return Object.values(PRICE_ID_ENV)
      .map((envVar) => process.env[envVar])
      .filter((id): id is string => Boolean(id))
      .includes(priceId);
  }

  private async getOrCreateStripeCustomer(
    user: AuthUser,
    subscriptionRowId: string,
  ): Promise<string> {
    const [sub] = await this.db
      .select({ stripeCustomerId: subscriptions.stripeCustomerId })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionRowId))
      .limit(1);

    if (sub?.stripeCustomerId) return sub.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });

    await this.db
      .update(subscriptions)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscriptionRowId));

    return customer.id;
  }
}
