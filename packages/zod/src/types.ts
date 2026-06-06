/**
 * Type definitions for Zod-based schema input.
 *
 * `ZodSchemaInput` wraps a Zod object schema with its message name so
 * the core client can generate proto3 and AMQP arguments identically
 * to the decorator path — without needing a class constructor.
 */

import { z } from 'zod';

/**
 * Pairs a Zod schema with its protobuf message name.
 *
 * WHY explicit name: unlike decorator classes, Zod schemas are plain
 * objects with no `.name` property. The message name is required by
 * the broker's `x-schema-message` argument for schema lookup.
 *
 * Usage:
 *   const input: ZodSchemaInput = {
 *     name: 'Notification',
 *     schema: z.object({ id: z.string(), content: z.string() }),
 *   };
 */
export interface ZodSchemaInput<T extends z.ZodRawShape = z.ZodRawShape> {
  /** Protobuf message name sent as `x-schema-message`. */
  name: string;
  /** Zod object schema defining the message shape. */
  schema: z.ZodObject<T>;
}

/**
 * Type guard: returns true if the value is a `{ name, schema }` wrapper.
 *
 * Usage:
 *   if (isZodSchemaInput(input)) { ... }
 */
export function isZodSchemaInput(value: unknown): value is ZodSchemaInput {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === 'string' && candidate.schema instanceof z.ZodObject;
}

/**
 * Type guard: returns true if the value is a raw `z.object(...)` schema.
 *
 * WHY separate guard: callers can pass a bare ZodObject without the
 * `{ name, schema }` wrapper — the message name is derived from the
 * queue name at the call site instead.
 *
 * Usage:
 *   if (isRawZodObject(input)) { ... }
 */
export function isRawZodObject(value: unknown): value is z.ZodObject<z.ZodRawShape> {
  return value instanceof z.ZodObject;
}
