/**
 * TC39 stage 3 decorators for schema definition.
 *
 * Collects field names and types from decorated classes into the
 * default SchemaRegistry so the SDK can generate proto3 definitions
 * and validate payloads at runtime.
 *
 * Usage:
 *   @Schema("notifications")
 *   class Notification {
 *     @Field() id!: string;
 *     @Field({ type: "int64" }) timestamp!: number;
 *   }
 */

import type { ProtoType } from './metadata.js';
import { defaultRegistry } from './registry.js';

/**
 * Marks a class as a schema definition.
 *
 * @param subject - Optional subject prefix for registry-based validation
 *                  (e.g. "notifications" → "notifications-value").
 */
export function Schema(subject?: string) {
  return function <T extends new (...args: unknown[]) => object>(
    target: T,
    _ctx: ClassDecoratorContext,
  ): T {
    // Ensure the field list exists even if no @Field() was used
    defaultRegistry.getOrCreateFields(target);

    if (subject) {
      defaultRegistry.setSubject(target, subject);
    }
    return target;
  };
}

interface FieldOptions {
  /** Proto3 scalar type. Defaults to "string". */
  type?: ProtoType;
}

/**
 * Marks a property as a schema field (TC39 stage 3 field decorator).
 *
 * Defers registration to `addInitializer` so the class constructor is
 * fully defined before we read `this.constructor`.
 */
export function Field(opts?: FieldOptions) {
  return function (_value: undefined, ctx: ClassFieldDecoratorContext) {
    const name = String(ctx.name);

    ctx.addInitializer(function (this: unknown) {
      const ctor = (this as Record<string, unknown>).constructor as Function;
      const fields = defaultRegistry.getOrCreateFields(ctor);

      // Prevent duplicate registrations from multiple instantiations
      if (fields.some((f) => f.name === name)) return;

      fields.push({
        name,
        protoType: opts?.type ?? 'string',
        number: fields.length + 1,
      });
    });
  };
}
