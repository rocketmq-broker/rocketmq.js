/**
 * Protobuf wire types supported by the schema decorator system.
 *
 * Maps 1:1 to proto3 scalar types so the SDK can generate
 * `.proto` definitions without requiring protobuf knowledge.
 *
 * Usage:
 *   @Field({ type: "int32" }) qty!: number;
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

/** Metadata captured by the @Field() decorator for a single class property. */
export interface FieldMeta {
  /** Property name on the decorated class. */
  name: string;
  /** Proto3 scalar type. Defaults to "string" when omitted. */
  protoType: ProtoType;
  /** 1-based field number for proto ordering. */
  number: number;
}

/** Collected metadata for a decorated schema class. */
export interface SchemaEntry {
  /** Class constructor reference. */
  ctor: Function;
  /** Human-readable schema name (defaults to class name). */
  name: string;
  /** Optional subject prefix for registry-based validation. */
  subject?: string;
  /** Ordered field definitions extracted from @Field() decorators. */
  fields: FieldMeta[];
}
