import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Logger,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { SubscriptionService } from './subscription.service';

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

/**
 * Checkout request.
 *
 * `priceId` is NOT accepted. It used to be — taken from the request body and
 * passed straight into Stripe's line_items, while STRIPE_PRICE_ID_PREMIUM_*
 * sat in config with zero call sites. Since handleCheckoutCompleted grants
 * `plan: 'premium'` regardless of what was actually purchased, any
 * authenticated user could post any recurring price ID from the Stripe account
 * — a legacy rate, a partner discount, a $1 internal test price — and receive
 * full Premium. Price IDs are not secret; they appear in checkout URLs and
 * survive in old page sources.
 *
 * The client now names the BILLING INTERVAL it wants; the server decides what
 * that costs.
 */
const checkoutBodySchema = z.object({
  interval: z.enum(['monthly', 'annual'], {
    required_error: 'interval is required',
    invalid_type_error: "interval must be 'monthly' or 'annual'",
  }),
});

@Controller('subscription')
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  // ---------------------------------------------------------------------------
  // GET /v1/subscription
  // ---------------------------------------------------------------------------

  /**
   * Return the current user's plan, subscription status, and monthly usage.
   * Used by the billing page and usage limit banners throughout the dashboard.
   */
  @Get()
  async getSubscription(@CurrentUser() user: AuthUser) {
    return this.subscriptionService.getSubscriptionStatus(user);
  }

  // ---------------------------------------------------------------------------
  // POST /v1/subscription/checkout
  // ---------------------------------------------------------------------------

  /**
   * Create a Stripe Checkout session for upgrading to Premium.
   * Returns a checkoutUrl — the frontend redirects the user to it.
   */
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  async createCheckout(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const result = checkoutBodySchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    return this.subscriptionService.createCheckoutSession(user, result.data.interval);
  }

  // ---------------------------------------------------------------------------
  // POST /v1/subscription/portal
  // ---------------------------------------------------------------------------

  /**
   * Create a Stripe Customer Portal session.
   * Returns a portalUrl — the frontend redirects the user to it.
   * Allows users to cancel, update payment method, or view invoices.
   */
  @Post('portal')
  @HttpCode(HttpStatus.CREATED)
  async createPortal(@CurrentUser() user: AuthUser) {
    return this.subscriptionService.createPortalSession(user);
  }
}
