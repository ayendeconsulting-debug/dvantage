import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { ErrorCode } from '@vantage/contracts';

/**
 * Global exception filter — translates every thrown exception to
 * RFC 7807 Problem Details format.
 *
 * https://www.rfc-editor.org/rfc/rfc7807
 *
 * All API errors share this shape:
 * {
 *   type:       string (URL),
 *   title:      string,
 *   status:     number,
 *   detail:     string (optional),
 *   code:       ErrorCode,
 *   requestId:  string,
 *   instance:   string,
 *   upgradeUrl: string (402 only),
 *   errors:     FieldError[] (422 only)
 * }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();

    const requestId =
      (request.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();
    const path = request.url;
    const method = request.method;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail: string | undefined;
    let code: string = ErrorCode.INTERNAL_ERROR;
    let errors: unknown[] | undefined;
    let upgradeUrl: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        detail = response;
      } else if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        detail = typeof r['message'] === 'string' ? r['message'] : JSON.stringify(r['message']);
        code = typeof r['code'] === 'string' ? r['code'] : httpStatusToCode(status);
        errors = Array.isArray(r['errors']) ? r['errors'] : undefined;
        upgradeUrl = typeof r['upgradeUrl'] === 'string' ? r['upgradeUrl'] : undefined;
      }

      title = httpStatusToTitle(status);
    } else if (exception instanceof Error) {
      // Unexpected error — log full stack, return opaque 500
      this.logger.error(
        `Unhandled exception [${requestId}] ${method} ${path}: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(`Unknown exception type [${requestId}]`, exception);
    }

    // Log 5xx at error level, 4xx at warn
    if (status >= 500) {
      this.logger.error(`[${requestId}] ${method} ${path} → ${status} ${code}`);
    } else if (status >= 400) {
      this.logger.warn(`[${requestId}] ${method} ${path} → ${status} ${code}`);
    }

    void reply
      .status(status)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: `https://docs.vantage.app/errors/${code.toLowerCase().replace(/_/g, '-')}`,
        title,
        status,
        detail,
        code,
        requestId,
        instance: path,
        ...(upgradeUrl !== undefined && { upgradeUrl }),
        ...(errors !== undefined && { errors }),
      });
  }
}

function httpStatusToTitle(status: number): string {
  const titles: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
  };
  return titles[status] ?? 'Error';
}

function httpStatusToCode(status: number): string {
  const codes: Record<number, string> = {
    400: ErrorCode.VALIDATION_ERROR,
    401: ErrorCode.UNAUTHORIZED,
    402: ErrorCode.USAGE_QUOTA_EXCEEDED,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    409: ErrorCode.CONFLICT,
    429: ErrorCode.AUTH_RATE_LIMITED,
    500: ErrorCode.INTERNAL_ERROR,
    503: ErrorCode.SERVICE_UNAVAILABLE,
  };
  return codes[status] ?? ErrorCode.INTERNAL_ERROR;
}
