import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import Stripe from 'stripe';
import { Public } from '../auth/decorators/public.decorator';
import { SubscriptionService } from './subscription.service';

/**
 * StripeWebhookController
 *
 * Registered at POST /stripe/webhook (no /v1 prefix — see main.ts exclude list).
 * Decorated with @Public() to bypass the global AuthGuard.
 *
 * Security is provided by Stripe's own signature verification:
 *   stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
 *
 * All event handlers are idempotent — upsert on stripe_subscription_id.
 */
@Controller('stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private readonly subscriptionService: SubscriptionService) {
    const secretKey = process.env['STRIPE_SECRET_KEY'] ?? '';
    this.webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    });
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() request: FastifyRequest & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: boolean }> {
    if (!this.webhookSecret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET not set — skipping signature verification in dev');
    }

    if (!request.rawBody) {
      throw new BadRequestException('Missing raw request body for webhook signature verification.');
    }

    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header.');
    }

    // -- Verify signature -----------------------------------------------------
    let event: Stripe.Event;
    try {
      event = this.webhookSecret
        ? this.stripe.webhooks.constructEvent(request.rawBody, signature, this.webhookSecret)
        : (JSON.parse(request.rawBody.toString('utf8')) as Stripe.Event); // dev: skip verify
    } catch (err) {
      this.logger.warn(`Webhook signature verification failed: ${(err as Error).message}`);
      throw new BadRequestException(`Webhook signature invalid: ${(err as Error).message}`);
    }

    this.logger.log(`Stripe webhook received — type=${event.type} id=${event.id}`);

    // -- Route events ---------------------------------------------------------
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.subscriptionService.handleCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session,
          );
          break;

        case 'customer.subscription.updated':
          await this.subscriptionService.handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription,
          );
          break;

        case 'customer.subscription.deleted':
          await this.subscriptionService.handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription,
          );
          break;

        case 'invoice.payment_failed':
          // Stripe automatically retries and will send subscription.updated
          // with status='past_due'. Log for visibility; no action needed here.
          this.logger.warn(
            `Payment failed — invoice=${(event.data.object as Stripe.Invoice).id}`,
          );
          break;

        default:
          // Unhandled event type — acknowledge to prevent Stripe retries
          this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
      }
    } catch (err) {
      // Log handler errors but return 200 to prevent Stripe from retrying —
      // failed handlers should be investigated via logs/Sentry, not retried.
      this.logger.error(
        `Webhook handler error for event ${event.type}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }

    return { received: true };
  }
}
