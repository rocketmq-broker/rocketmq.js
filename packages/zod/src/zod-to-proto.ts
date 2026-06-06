/**
 * High-level Zod schema → proto3 string conversion.
 *
 * Composes `zodToFields()` and `fieldsToProto()` into a single call
 * so consumers don't need to touch FieldMeta directly.
 *
 * Usage:
 *   const proto = zodToProto('Notification', NotificationSchema);
 *   // => 'syntax = "proto3";\n\nmessage Notification { ... }'
 */

import { z } from 'zod';
import { fieldsToProto } from '@rocketmq/protobuf';
import { zodToFields } from './zod-to-fields.js';

/**
 * Converts a named Zod object schema to a full proto3 definition string.
 *
 * The `messageName` becomes the protobuf message name and is sent to the
 * broker as `x-schema-message` for schema lookup.
 *
 * Usage:
 *   const proto = zodToProto('Order', OrderSchema);
 */
export function zodToProto(messageName: string, schema: z.ZodObject<z.ZodRawShape>): string {
  const fields = zodToFields(schema);
  return fieldsToProto(messageName, fields);
}
