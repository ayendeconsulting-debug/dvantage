import { z } from 'zod';

/**
 * Every domain event in the system extends this base schema.
 * The `correlationId` links events spawned by the same user action.
 */
export const domainEventSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  occurredAt: z.coerce.date(),
  correlationId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  payload: z.record(z.unknown()),
});

export type DomainEvent = z.infer<typeof domainEventSchema>;
