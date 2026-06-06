import type { Constructor } from './types.js';

/**
 * Protobuf wire types supported by the schema decorator system.
 *
 * Maps 1:1 to proto3 scalar types so the SDK can generate
 * `.proto` definitions without requiring protobuf knowledge.
 */
export type ProtoType =
  | 'string'
  | 'int32'
  | 'int64'
  | 'uint32'
  | 'uint64'
  | 'float'
  | 'double'
  | 'bool'
  | 'bytes';

/** Additional configuration options passed to the @Field() decorator. */
export interface FieldOptions {
  /** Explicit proto3 type override (scalar or custom message name). */
  type?: string;
  /** Emits 'repeated' prefix for arrays. */
  repeated?: boolean;
  /** Emits 'optional' prefix for optional presence. */
  optional?: boolean;
  /** Inline comment written above the field. */
  comment?: string;
}

/** Metadata captured by the @Field() decorator for a single class property. */
export interface FieldMeta extends FieldOptions {
  /** Property name on the decorated class. */
  name: string;
  /** Proto3 type. Defaults to "string" when omitted. */
  protoType: string;
  /** 1-based field number for proto ordering. */
  number: number;
  /** Constructor captured by reflect-metadata (String, Number, Boolean, Date, etc.). */
  reflectedType?: Constructor;
}

/** Collected metadata for a decorated schema class. */
export interface SchemaEntry {
  /** Class constructor reference. */
  ctor: Constructor;
  /** Human-readable schema name (defaults to class name). */
  name: string;
  /** Optional subject prefix for registry-based validation. */
  subject?: string;
  /** Ordered field definitions extracted from @Field() decorators. */
  fields: FieldMeta[];
}
