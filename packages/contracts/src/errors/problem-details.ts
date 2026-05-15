import { z } from 'zod';
import { type ErrorCode } from './error-codes';

/**
 * RFC 7807 Problem Details — the wire format for every API error.
 * https://www.rfc-editor.org/rfc/rfc7807
 *
 * Extended with:
 *   - `code`      — machine-readable error code from the catalog
 *   - `requestId` — for support/tracing correlation
 *   - `errors`    — field-level validation errors (422 only)
 */
export const problemDetailsSchema = z.object({
  type: z.string().url().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string() as z.ZodType<ErrorCode>,
  requestId: z.string().optional(),
  errors: z
    .array(
      z.object({
        field: z.string(),
        message: z.string(),
        code: z.string(),
      }),
    )
    .optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
