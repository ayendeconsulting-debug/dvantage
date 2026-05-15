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

const checkoutBodySchema = z.object({
  priceId: z.string().min(1, 'priceId is required'),
  // interval is informational only — the actual price is defined in Stripe
  interval: z.enum(['monthly', 'annual']).optional(),
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
  async createCheckout(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const result = checkoutBodySchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    return this.subscriptionService.createCheckoutSession(user, result.data.priceId);
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
