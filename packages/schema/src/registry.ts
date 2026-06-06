/**
 * In-memory schema registry.
 *
 * Replaces the module-level Map globals from the original schema.ts.
 * Injectable via constructor so tests can use isolated instances.
 */

import type { FieldMeta, SchemaEntry } from './metadata.js';
import type { Constructor } from './types.js';

export class SchemaRegistry {
  /** Queue name → schema entry. */
  private byQueue = new Map<string, SchemaEntry>();

  /** Class constructor → field metadata (populated by decorators). */
  private fieldStore = new Map<Constructor, FieldMeta[]>();

  /** Class constructor → subject prefix (populated by @Schema("subject")). */
  private subjectStore = new Map<Constructor, string>();

  /** Set of all decorated schema constructors. */
  private allSchemas = new Set<Constructor>();

  /** Tracks a constructor as a decorated schema. */
  registerSchema(ctor: Constructor): void {
    this.allSchemas.add(ctor);
  }

  /** Returns true if a constructor is a registered schema. */
  isSchema(ctor: Constructor): boolean {
    return this.allSchemas.has(ctor);
  }

  /** Looks up a schema constructor by its class name. */
  getSchemaByName(name: string): Constructor | undefined {
    for (const ctor of this.allSchemas) {
      if (ctor.name === name) {
        return ctor;
      }
    }
    return undefined;
  }

  /** Binds a queue name to a fully resolved schema entry. */
  register(queueName: string, entry: SchemaEntry): void {
    this.byQueue.set(queueName, entry);
  }

  /** Returns the schema entry for a queue, or undefined if unregistered. */
  lookup(queueName: string): SchemaEntry | undefined {
    return this.byQueue.get(queueName);
  }

  /** Returns all registered schema entries. */
  listAll(): SchemaEntry[] {
    return [...this.byQueue.values()];
  }

  /** Stores the subject prefix set by @Schema("subject"). */
  setSubject(ctor: Constructor, subject: string): void {
    this.subjectStore.set(ctor, subject);
  }

  /** Returns the subject prefix for a class, if any. */
  getSubject(ctor: Constructor): string | undefined {
    return this.subjectStore.get(ctor);
  }

  /** Returns the mutable field list for a class, creating it if absent. */
  getOrCreateFields(ctor: Constructor): FieldMeta[] {
    let fields = this.fieldStore.get(ctor);
    if (!fields) {
      fields = [];
      this.fieldStore.set(ctor, fields);
    }
    return fields;
  }

  /** Returns the field metadata for a class (read-only snapshot). */
  getFields(ctor: Constructor): readonly FieldMeta[] {
    return this.fieldStore.get(ctor) ?? [];
  }
}

/**
 * Default singleton registry used by decorators.
 *
 * Exported so @Schema() and @Field() can register metadata at class
 * definition time without requiring explicit wiring. The core package
 * reads from this same instance during publish/consume.
 */
export const defaultRegistry = new SchemaRegistry();
