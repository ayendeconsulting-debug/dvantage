/**
 * Queue name registry.
 * All BullMQ queue names used across the platform.
 * Never use string literals — always import from here.
 */
export const QUEUE_NAMES = {
  // AI worker queues
  AI_RESUME_PARSE: 'ai.resume-parse',
  AI_RESUME_OPTIMIZE: 'ai.resume-optimize',
  AI_ATS_SCORE: 'ai.ats-score',
  AI_COVER_LETTER: 'ai.cover-letter',
  AI_ROLE_RECOMMEND: 'ai.role-recommend',

  // Scraper worker queues (Phase 2)
  SCRAPER_FETCH: 'scraper.fetch',
  SCRAPER_NORMALIZE: 'scraper.normalize',

  // Automation worker queues (Phase 3)
  AUTOMATION_APPLICATION: 'automation.application',
  AUTOMATION_SESSION: 'automation.session',

  // Inbox worker queues (Phase 4)
  INBOX_POLL: 'inbox.poll',
  INBOX_CLASSIFY: 'inbox.classify',

  // Scheduler triggers (enqueues to other workers)
  SCHEDULER_CRON: 'scheduler.cron',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
