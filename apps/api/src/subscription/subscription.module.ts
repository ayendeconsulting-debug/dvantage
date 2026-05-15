import { Module } from '@nestjs/common';
import { SubscriptionService }       from './subscription.service';
import { SubscriptionController }    from './subscription.controller';
import { StripeWebhookController }   from './stripe-webhook.controller';
import { DatabaseModule }            from '../database/database.module';

/**
 * SubscriptionModule
 *
 * Owns:
 *   M4-A — Subscription data layer, entitlement checks, usage metering,
 *           Stripe checkout + portal sessions
 *   M4-B — Stripe webhook handler at POST /stripe/webhook (@Public, no /v1 prefix)
 *
 * SubscriptionService is exported so JobModule, AtsScoreService, and
 * OptimizeService can inject it for entitlement enforcement in M4-C.
 */
@Module({
  imports:     [DatabaseModule],
  providers:   [SubscriptionService],
  controllers: [SubscriptionController, StripeWebhookController],
  exports:     [SubscriptionService],
})
export class SubscriptionModule {}
