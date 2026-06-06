/**
 * Converts a Zod object schema to FieldMeta[] for proto3 generation.
 *
 * Each top-level key in the ZodObject becomes a proto field. Zod types
 * are mapped to proto3 scalar types using the same names as the
 * decorator system so both paths produce identical proto output.
 *
 * Usage:
 *   const fields = zodToFields(z.object({ id: z.string(), qty: z.number() }));
 *   // => [{ name: 'id', protoType: 'string', number: 1 }, ...]
 */

import { z } from 'zod';
import type { FieldMeta } from '@rocketmq/schema';

/**
 * Maps a single Zod type to a proto3 scalar name.
 *
 * WHY inner-unwrap: ZodOptional/ZodNullable/ZodDefault wrap the real
 * type — we peel those off before inspecting the core type.
 */
export function zodTypeToProto(schema: z.ZodTypeAny): string {
  const unwrapped = unwrapOuter(schema);

  if (unwrapped instanceof z.ZodString) return 'string';
  if (unwrapped instanceof z.ZodBoolean) return 'bool';
  if (unwrapped instanceof z.ZodNumber) return inferNumericProto(unwrapped);
  if (unwrapped instanceof z.ZodBigInt) return 'int64';
  if (unwrapped instanceof z.ZodDate) return 'google.protobuf.Timestamp';
  if (unwrapped instanceof z.ZodEnum) return 'string';
  if (unwrapped instanceof z.ZodArray) return zodTypeToProto(unwrapped.element);
  if (unwrapped instanceof z.ZodObject) return 'bytes';

  return 'string';
}

/**
 * Peels Optional / Nullable / Default / Branded wrappers to reach the
 * actual value schema. Recurses until hitting a concrete type.
 */
function unwrapOuter(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodOptional) return unwrapOuter(schema.unwrap());
  if (schema instanceof z.ZodNullable) return unwrapOuter(schema.unwrap());
  if (schema instanceof z.ZodDefault) return unwrapOuter(schema.removeDefault());
  if (schema instanceof z.ZodBranded) return unwrapOuter(schema.unwrap());
  return schema;
}

/**
 * Heuristic: if the Zod number has `.int()` checks, emit int32.
 * Otherwise default to double (matches decorator inference for `number`).
 */
function inferNumericProto(schema: z.ZodNumber): string {
  const hasIntCheck = schema._def.checks.some((c: z.ZodNumberCheck) => c.kind === 'int');
  return hasIntCheck ? 'int32' : 'double';
}

/** Checks if a Zod field is marked optional. */
function isOptionalField(schema: z.ZodTypeAny): boolean {
  return schema instanceof z.ZodOptional || schema.isOptional();
}

/** Checks if a Zod field is an array type (after unwrapping). */
function isRepeatedField(schema: z.ZodTypeAny): boolean {
  const unwrapped = unwrapOuter(schema);
  return unwrapped instanceof z.ZodArray;
}

/**
 * Converts a ZodObject to an ordered array of FieldMeta.
 *
 * Field numbers are assigned in key-insertion order (1-based),
 * matching the proto3 convention used by the decorator path.
 *
 * Usage:
 *   const fields = zodToFields(z.object({ id: z.string() }));
 */
export function zodToFields(schema: z.ZodObject<z.ZodRawShape>): FieldMeta[] {
  const shape = schema.shape;
  const keys = Object.keys(shape);

  if (keys.length === 0) {
    throw new Error(
      `Zod schema has no fields — cannot generate proto. ` +
        `Expected z.object({ ... }) with at least one key.`,
    );
  }

  return keys.map((key, idx) => {
    const fieldSchema = shape[key] as z.ZodTypeAny;
    return buildFieldMeta(key, fieldSchema, idx + 1);
  });
}

/** Builds a single FieldMeta entry from a Zod key + its type schema. */
function buildFieldMeta(name: string, schema: z.ZodTypeAny, number: number): FieldMeta {
  return {
    name,
    protoType: zodTypeToProto(schema),
    number,
    optional: isOptionalField(schema) || undefined,
    repeated: isRepeatedField(schema) || undefined,
  };
}
