import { HttpException } from '@nestjs/common';
import { ErrorCode } from '@vantage/contracts';

/**
 * Thrown when a free-tier user exceeds their monthly usage quota.
 * Produces HTTP 402 Payment Required with RFC 7807 body including upgradeUrl.
 *
 * The AllExceptionsFilter extracts `upgradeUrl` from the response body
 * and includes it in the Problem Details response.
 */
export class PaymentRequiredException extends HttpException {
  constructor(
    message: string,
    upgradeUrl = 'http://localhost:3000/dashboard/settings/billing',
  ) {
    super(
      {
        message,
        code:       ErrorCode.USAGE_QUOTA_EXCEEDED,
        upgradeUrl,
      },
      402,
    );
  }
}
