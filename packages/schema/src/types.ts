/**
 * Core type definitions for the schema package.
 */

/**
 * Represents a class constructor.
 * Used to replace the generic 'Function' type for stricter type safety.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor<T = object> = new (...args: any[]) => T;
