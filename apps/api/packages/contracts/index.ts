/**
 * @vantage/contracts
 *
 * Shared API surface:
 * - Request/response DTOs (Zod schemas + inferred types)
 * - RFC 7807 Problem Details error catalog
 * - Pagination types
 * - Entitlement identifiers
 *
 * Both the NestJS API and the Next.js frontend import from here.
 * This package MUST NOT import from any other @vantage/* package
 * to avoid circular dependency chains.
 */

// Error catalog
export * from './errors/error-codes';
export * from './errors/problem-details';

// Pagination
export * from './pagination/cursor';

// Entitlements
export * from './entitlements/entitlement-ids';
