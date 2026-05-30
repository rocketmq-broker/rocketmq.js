/**
 * Generates a proto3 schema string from a decorated class.
 *
 * Reads field metadata from the default SchemaRegistry and produces
 * the exact format the Rust broker expects in the `x-schema` queue argument.
 *
 * Usage:
 *   const proto = toProto(NotificationClass);
 *   // => 'syntax = "proto3"; message Notification { string id = 1; int64 timestamp = 2; }'
 */

import { defaultRegistry } from '@rocketmq/schema';

/**
 * Forces field registration by instantiating the class once.
 *
 * TC39 field decorators defer registration via `addInitializer`,
 * which only runs on construction. If no instance exists yet,
 * the registry will have zero fields for the class.
 */
function ensureFieldsRegistered(schema: Function): void {
  if (defaultRegistry.getFields(schema).length > 0) return;

  try {
    new (schema as new () => unknown)();
  } catch {
    // Constructor may throw — fields are registered via addInitializer
  }
}

/**
 * Converts a decorated schema class to a proto3 definition string.
 *
 * @throws Error if the class has no @Field() decorators.
 */
export function toProto(schema: Function): string {
  ensureFieldsRegistered(schema);

  const fields = defaultRegistry.getFields(schema);
  if (fields.length === 0) {
    throw new Error(`Schema '${schema.name}' has no @Field() decorators — cannot generate proto`);
  }

  const body = fields.map((f) => `${f.protoType} ${f.name} = ${f.number};`).join(' ');

  return `syntax = "proto3"; message ${schema.name} { ${body} }`;
}
