import { z } from 'zod';

export const cursorParamsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CursorParams = z.infer<typeof cursorParamsSchema>;

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().optional(),
  });

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  total?: number;
}
