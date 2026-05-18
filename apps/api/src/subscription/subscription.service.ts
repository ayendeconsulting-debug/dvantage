import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
  ats_score:    3,
  optimization: 1,
  job_created:  3,
} as const satisfies Record<UsageEventType, number>;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly stripe: Stripe;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseClient,
  ) {
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
      plan:              sub.plan,
      status:            sub.status,
      currentPeriodEnd:  sub.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      usage: {
        atsScoresUsed:      atsUsed,
        atsScoresLimit:     isPremium ? null : FREE_LIMITS.ats_score,
        optimizationsUsed:  optUsed,
        optimizationsLimit: isPremium ? null : FREE_LIMITS.optimization,
        jobsCreatedUsed:    jobsUsed,
        jobsCreatedLimit:   isPremium ? null : FREE_LIMITS.job_created,
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
      id:        uuidv7(),
      userId,
      eventType,
      createdAt: new Date(),
    });
    this.logger.log(`Usage recorded — user=${userId} type=${eventType}`);
  }

  // ---------------------------------------------------------------------------
  // POST /v1/subscription/checkout
  // ---------------------------------------------------------------------------

  async createCheckoutSession(
    user: AuthUser,
    priceId: string,
  ): Promise<CheckoutSessionDto> {
    const sub        = await this.getOrCreateSubscription(user.id);
    const appUrl     = process.env['APP_URL'] ?? 'http://localhost:3000';
    const customerId = await this.getOrCreateStripeCustomer(user, sub.id);

    const session = await this.stripe.checkout.sessions.create({
      customer:              customerId,
      mode:                  'subscription',
      line_items:            [{ price: priceId, quantity: 1 }],
      success_url:           `${appUrl}/dashboard/settings/billing?success=1`,
      cancel_url:            `${appUrl}/dashboard/settings/billing?canceled=1`,
      allow_promotion_codes: true,
      metadata:              { userId: user.id, subscriptionRowId: sub.id },
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

    const appUrl  = process.env['APP_URL'] ?? 'http://localhost:3000';
    const session = await this.stripe.billingPortal.sessions.create({
      customer:   sub.stripeCustomerId,
      return_url: `${appUrl}/dashboard/settings/billing`,
    });

    this.logger.log(`Portal session created — user=${user.id}`);
    return { portalUrl: session.url };
  }

  // ---------------------------------------------------------------------------
  // Webhook helpers — called by StripeWebhookController
  // ---------------------------------------------------------------------------

  async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId         = session.metadata?.['userId'];
    const subscriptionId = session.subscription as string | null;
    const customerId     = session.customer as string | null;

    if (!userId || !subscriptionId || !customerId) {
      this.logger.warn('checkout.session.completed missing metadata — skipping');
      return;
    }

    const stripeSub = await this.stripe.subscriptions.retrieve(subscriptionId);

    await this.db
      .update(subscriptions)
      .set({
        plan:                 'premium',
        stripeCustomerId:     customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId:        (stripeSub.items.data[0]?.price.id) ?? null,
        status:               stripeSub.status as SubscriptionStatus,
        currentPeriodStart:   new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd:     new Date(stripeSub.current_period_end   * 1000),
        cancelAtPeriodEnd:    stripeSub.cancel_at_period_end,
        updatedAt:            new Date(),
      })
      .where(eq(subscriptions.userId, userId));

    this.logger.log(`Subscription activated — user=${userId}`);
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
    const isActive   = ['active', 'trialing'].includes(stripeSub.status);
    const customerId = stripeSub.customer as string;

    const patch = {
      plan:                 (isActive ? 'premium' : 'free') as PlanType,
      // Always stamp stripeSubscriptionId — critical for the fallback path to
      // ensure future events match via the primary path.
      stripeSubscriptionId: stripeSub.id,
      stripePriceId:        (stripeSub.items.data[0]?.price.id) ?? null,
      status:               stripeSub.status as SubscriptionStatus,
      currentPeriodStart:   new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd:     new Date(stripeSub.current_period_end   * 1000),
      cancelAtPeriodEnd:    stripeSub.cancel_at_period_end,
      updatedAt:            new Date(),
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
        plan:              'free',
        status:            'canceled',
        cancelAtPeriodEnd: false,
        updatedAt:         new Date(),
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

    const id  = uuidv7();
    const now = new Date();

    await this.db
      .insert(subscriptions)
      .values({
        id,
        userId,
        plan:              'free',
        cancelAtPeriodEnd: false,
        createdAt:         now,
        updatedAt:         now,
      })
      .onConflictDoNothing();

    // Re-fetch after insert (handles race where another request created it first)
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (!row) throw new Error(`SubscriptionService: failed to create subscription for user=${userId}`);
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
    const used  = await this.countThisMonth(userId, eventType);

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
      email:    user.email,
      metadata: { userId: user.id },
    });

    await this.db
      .update(subscriptions)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscriptionRowId));

    return customer.id;
  }
}
