/**
 * @vantage/validation
 *
 * Shared Zod schemas consumed by both the NestJS API (for request validation)
 * and the Next.js frontend (for form validation and type inference).
 *
 * Schemas are co-located with the domain they validate.
 * The API adds NestJS-specific decorators on top; the web uses these directly.
 */
// Auth
export * from './auth/login.schema';
export * from './auth/register.schema';
export * from './auth/reset-password.schema';
// Resume
export * from './resume/upload.schema';
export * from './resume/resume-data.schema';
// Job
export * from './job/job-description.schema';
// ATS
export * from './ats/ats-score.schema';
