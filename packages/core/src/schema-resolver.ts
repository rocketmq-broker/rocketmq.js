/**
 * Resolves proto3 definitions from decorator classes, Zod wrappers, or raw ZodObjects.
 *
 * Centralizes the tri-input logic so client.ts and queue-handle.ts stay
 * clean — they just call `resolveProto(input, queueName)` without caring
 * which path produced it.
 *
 * Usage:
 *   resolveProto(NotificationClass, 'q');
 *   resolveProto({ name: 'Notif', schema: zodSchema }, 'q');
 *   resolveProto(zodSchema, 'q');  // message name derived from queue name
 */

import { toProto } from '@rocketmq/protobuf';
import type { Constructor } from '@rocketmq/schema';
import { isRawZodObject, isZodSchemaInput, zodToProto, type ZodSchemaInput } from '@rocketmq/zod';
import { z } from 'zod';

/**
 * Union type accepted by assertQueue/consume as the schema parameter.
 *
 * Three shapes:
 *   - `Constructor<T>` — decorator class
 *   - `ZodSchemaInput` — `{ name, schema }` wrapper with explicit message name
 *   - `z.ZodType<T>` — bare Zod schema, message name derived from queue name
 *
 * WHY z.ZodType<T> instead of z.ZodObject: ZodObject<ZodRawShape> erases T,
 * so TS can't infer the message type in consume(). ZodType<T> preserves
 * the output type. Runtime still validates it's a ZodObject via isRawZodObject.
 */
export type SchemaInput<T = unknown> = Constructor<T> | ZodSchemaInput | z.ZodType<T>;

/** Result of resolving a SchemaInput to proto3. */
export interface ResolvedSchema {
  /** Full proto3 definition string for AMQP x-schema argument. */
  proto: string;
  /** Message name for AMQP x-schema-message argument. */
  messageName: string;
}

/**
 * Converts a kebab/snake queue name to PascalCase for the proto message name.
 *
 * WHY: protobuf message names must be PascalCase identifiers.
 * `zod-notifications` → `ZodNotifications`, `order_items` → `OrderItems`.
 *
 * Usage:
 *   queueNameToMessageName('my-queue') // => 'MyQueue'
 */
export function queueNameToMessageName(queueName: string): string {
  return queueName
    .split(/[-_.]/)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('');
}

/**
 * Produces proto3 + message name from a Constructor, ZodSchemaInput, or raw ZodObject.
 *
 * When a raw ZodObject is passed, `fallbackName` is converted to PascalCase
 * and used as the protobuf message name.
 *
 * Usage:
 *   resolveProto(MyClass, 'orders');
 *   resolveProto({ name: 'Order', schema: zodObj }, 'orders');
 *   resolveProto(zodObj, 'orders');  // message name = "Orders"
 */
export function resolveProto(input: SchemaInput, fallbackName: string): ResolvedSchema {
  if (isZodSchemaInput(input)) {
    return {
      proto: zodToProto(input.name, input.schema),
      messageName: input.name,
    };
  }

  if (isRawZodObject(input)) {
    const messageName = queueNameToMessageName(fallbackName);
    return {
      proto: zodToProto(messageName, input),
      messageName,
    };
  }

  const ctor = input as Constructor;
  return {
    proto: toProto(ctor),
    messageName: ctor.name,
  };
}

/**
 * Type guard: returns true if the input is a class constructor (not Zod).
 *
 * Used by the client to conditionally register decorator metadata
 * (Zod schemas don't have constructors to register).
 */
export function isConstructorInput(input: SchemaInput): input is Constructor {
  return !isZodSchemaInput(input) && !isRawZodObject(input);
}
