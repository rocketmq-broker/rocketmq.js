/**
 * Generates proto3 from raw FieldMeta arrays — no class/decorator dependency.
 *
 * This is the shared codegen path used by both the decorator-based `toProto()`
 * and the Zod-based `zodToProto()` pipelines. Factoring it here avoids
 * duplicating proto string assembly logic.
 *
 * Usage:
 *   fieldsToProto('Order', [{ name: 'id', protoType: 'string', number: 1 }]);
 */

import type { FieldMeta } from '@rocketmq/schema';

/** Builds a single proto3 field line from resolved metadata. */
function buildFieldLine(field: FieldMeta): string {
  const modifier = field.repeated ? 'repeated ' : field.optional ? 'optional ' : '';
  return `${modifier}${field.protoType} ${field.name} = ${field.number};`;
}

/**
 * Checks whether any field in the list needs the Timestamp import.
 *
 * Extracted so callers don't need to know the magic string.
 */
function needsTimestampImport(fields: FieldMeta[]): boolean {
  return fields.some((f) => f.protoType === 'google.protobuf.Timestamp');
}

/** Appends one protobuf message block to the output lines array. */
function appendMessageBlock(messageName: string, fields: FieldMeta[], lines: string[]): void {
  if (fields.length === 0) {
    throw new Error(`Schema '${messageName}' has no fields — cannot generate proto. Got 0 fields.`);
  }
  lines.push(`message ${messageName} {`);
  for (const field of fields) {
    if (field.comment) {
      lines.push(`  // ${field.comment}`);
    }
    lines.push(`  ${buildFieldLine(field)}`);
  }
  lines.push('}', '');
}

/**
 * Converts a message name + field metadata list into a proto3 definition.
 *
 * This is the low-level entrypoint — no class introspection, no registry
 * lookups. Works with any source that can produce `FieldMeta[]`.
 *
 * Usage:
 *   const proto = fieldsToProto('Notification', fields);
 *   // => 'syntax = "proto3";\n\nmessage Notification { ... }'
 */
export function fieldsToProto(messageName: string, fields: FieldMeta[]): string {
  const lines: string[] = ['syntax = "proto3";', ''];
  if (needsTimestampImport(fields)) {
    lines.push('import "google/protobuf/timestamp.proto";', '');
  }
  appendMessageBlock(messageName, fields, lines);
  return lines.join('\n').trimEnd();
}
