/**
 * Branded type primitive.
 * Used to distinguish domain identifiers from plain strings/numbers at compile time.
 *
 * @example
 *   type UserId = Brand<string, 'UserId'>;
 *   const userId = brand<UserId>('usr_abc123');
 */
declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };

export function brand<T extends Brand<unknown, string>>(value: T extends Brand<infer V, string> ? V : never): T {
  return value as T;
}
