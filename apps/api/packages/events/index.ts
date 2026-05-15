/**
 * @vantage/events
 *
 * Domain event type definitions — Zod-validated, strongly typed.
 * Used as BullMQ job payloads and persisted to the audit events table.
 *
 * Convention:
 *   - Event names: DOMAIN.ENTITY.PAST_TENSE (e.g. resume.parse.completed)
 *   - Every event has: id (UUID v7), occurredAt, correlationId, payload
 *
 * Events are append-only. Never mutate a published event schema —
 * create a new version (resume.parse.completed.v2) instead.
 */

export { type DomainEvent, domainEventSchema } from './base.event';

// Events populated per milestone:
// M2: resume.uploaded, resume.parse.requested, resume.parse.completed
// M3: ats.score.requested, ats.score.completed, resume.optimize.completed
// M4: subscription.created, subscription.cancelled, usage.recorded
// M5: application.created, application.status.updated
