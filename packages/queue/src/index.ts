/**
 * @vantage/queue
 *
 * BullMQ queue name registry, job type definitions, and worker base class.
 * All apps import queue names from here — never hardcode queue strings.
 *
 * Worker topology (from architecture decisions):
 *   worker-ai        → ai.resume-parse, ai.resume-optimize, ai.ats-score, ai.cover-letter
 *   worker-scraper   → scraper.fetch, scraper.normalize
 *   worker-automation→ automation.application, automation.session
 *   worker-inbox     → inbox.poll, inbox.classify
 *   worker-scheduler → cron triggers only
 */

export { QUEUE_NAMES, type QueueName } from './queue-names';
export { createQueueConnection } from './connection';
