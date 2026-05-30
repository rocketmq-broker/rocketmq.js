/**
 * Validates a payload against the schema registered for a queue.
 *
 * Looks up the queue in the SchemaRegistry, builds a Zod schema from
 * its field metadata, and parses the payload. Returns structured
 * validation issues on failure.
 *
 * Usage:
 *   const result = validatePayload(registry, "orders", { id: "1" });
 *   if (!result.ok) console.error(result.issues);
 */

import type { SchemaRegistry } from '@rocketmq/schema';
import { ZodError } from 'zod';
import { buildZodSchema } from './bridge.js';

export interface ValidationSuccess {
  ok: true;
}

export interface ValidationFailure {
  ok: false;
  /** Human-readable issue descriptions. */
  issues: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validates a payload against the schema bound to a queue name.
 *
 * Returns `{ ok: true }` when no schema is registered (passthrough)
 * or when validation passes. Returns `{ ok: false, issues }` on failure.
 */
export function validatePayload(
  registry: SchemaRegistry,
  queueName: string,
  payload: unknown,
): ValidationResult {
  const entry = registry.lookup(queueName);
  if (!entry) return { ok: true };

  const zodSchema = buildZodSchema(entry.fields);

  try {
    zodSchema.parse(payload);
    return { ok: true };
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      return { ok: false, issues };
    }
    return { ok: false, issues: [String(err)] };
  }
}
