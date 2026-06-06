/**
 * Generates a proto3 schema string from a decorated class.
 *
 * Reads field metadata from the default SchemaRegistry and produces
 * the exact format the Rust broker expects in the `x-schema` queue argument.
 */

import { defaultRegistry, type FieldMeta, type Constructor } from '@rocketmq/schema';

/** Forces field registration by instantiating the class once. */
function ensureFieldsRegistered(schema: Constructor): void {
  if (defaultRegistry.getFields(schema).length > 0) return;
  try {
    new schema();
  } catch {
    // Constructor may throw — fields are registered via addInitializer
  }
}

/** Recursively collects all schema constructors referenced by the class. */
function collectDependentSchemas(
  schema: Constructor,
  seen = new Set<Constructor>(),
  orderedList: Constructor[] = [],
): Constructor[] {
  if (seen.has(schema)) return orderedList;
  seen.add(schema);

  const fields = defaultRegistry.getFields(schema);
  for (const field of fields) {
    if (field.reflectedType && defaultRegistry.isSchema(field.reflectedType)) {
      collectDependentSchemas(field.reflectedType, seen, orderedList);
    }
    if (field.type) {
      const depSchema = defaultRegistry.getSchemaByName(field.type);
      if (depSchema) {
        collectDependentSchemas(depSchema, seen, orderedList);
      }
    }
  }
  orderedList.push(schema);
  return orderedList;
}

/** Determines if any schema in the list uses a Timestamp type. */
function needsTimestamp(schemas: Constructor[]): boolean {
  return schemas.some((s) =>
    defaultRegistry.getFields(s).some((f) => f.protoType === 'google.protobuf.Timestamp'),
  );
}

/** Builds the protobuf field line using the pre-resolved protoType. */
function buildFieldLine(field: FieldMeta): string {
  const modifier = field.repeated ? 'repeated ' : field.optional ? 'optional ' : '';
  return `${modifier}${field.protoType} ${field.name} = ${field.number};`;
}

/** Formats a schema class as a protobuf message block. */
function buildMessageBlock(schema: Constructor, lines: string[]): void {
  const fields = defaultRegistry.getFields(schema);
  if (fields.length === 0) {
    throw new Error(`Schema '${schema.name}' has no @Field() decorators — cannot generate proto`);
  }
  lines.push(`message ${schema.name} {`);
  for (const field of fields) {
    if (field.comment) {
      lines.push(`  // ${field.comment}`);
    }
    lines.push(`  ${buildFieldLine(field)}`);
  }
  lines.push('}', '');
}

/** Converts a decorated schema class to a proto3 definition string. */
export function toProto(schema: Constructor): string {
  ensureFieldsRegistered(schema);
  const orderedList = collectDependentSchemas(schema);
  if (orderedList.length === 0 || defaultRegistry.getFields(schema).length === 0) {
    throw new Error(`Schema '${schema.name}' has no @Field() decorators — cannot generate proto`);
  }
  const lines: string[] = ['syntax = "proto3";', ''];
  if (needsTimestamp(orderedList)) {
    lines.push('import "google/protobuf/timestamp.proto";', '');
  }
  for (const s of orderedList) {
    buildMessageBlock(s, lines);
  }
  return lines.join('\n').trimEnd();
}
