/**
 * Bridges @Field() metadata → Zod schemas for runtime validation.
 *
 * Maps each ProtoType to its corresponding Zod validator so the
 * publish pipeline can catch invalid payloads before they hit the wire.
 *
 * Usage:
 *   const zodSchema = buildZodSchema(fields);
 *   zodSchema.parse({ id: "1", qty: 5 });
 */

import type { FieldMeta, ProtoType } from '@rocketmq/schema';
import { z, type ZodObject, type ZodRawShape, type ZodTypeAny } from 'zod';

/** Maps proto3 scalar types to Zod validators. */
const PROTO_ZOD_MAP: Record<ProtoType, () => ZodTypeAny> = {
  string: () => z.string(),
  int32: () => z.number().int(),
  int64: () => z.number().int(),
  uint32: () => z.number().int().nonnegative(),
  uint64: () => z.number().int().nonnegative(),
  float: () => z.number(),
  double: () => z.number(),
  bool: () => z.boolean(),
  bytes: () => z.instanceof(Buffer),
};

/**
 * Builds a Zod object schema from @Field() metadata.
 *
 * Every field in the proto schema becomes a required Zod property.
 * This mirrors the broker's JSON validation which rejects payloads
 * missing any declared field.
 */
export function buildZodSchema(fields: readonly FieldMeta[]): ZodObject<ZodRawShape> {
  const shape: ZodRawShape = {};

  for (const field of fields) {
    const factory = PROTO_ZOD_MAP[field.protoType];
    shape[field.name] = factory();
  }

  return z.object(shape);
}
