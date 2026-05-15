/**
 * @vantage/domain
 *
 * Domain value objects and primitives shared across modules.
 * These are pure TypeScript — no framework dependencies.
 *
 * Value objects are immutable, equality by value, no identity.
 * Populated milestone by milestone as domain logic solidifies.
 */

export { Money } from './value-objects/money';
export { ATSScore } from './value-objects/ats-score';
export { type Brand, brand } from './primitives/brand';
