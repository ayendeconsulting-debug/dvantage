import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Stamps every request with a unique X-Request-Id header.
 * If the client sends one, that value is preserved and echoed back.
 * The request ID propagates to the exception filter and logs.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http    = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply   = http.getResponse<FastifyReply>();

    const requestId =
      (request.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();

    // Ensure the header is set on the request so filters/services can read it
    request.headers['x-request-id'] = requestId;

    return next.handle().pipe(
      tap(() => {
        void reply.header('X-Request-Id', requestId);
      }),
    );
  }
}
