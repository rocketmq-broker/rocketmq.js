/**
 * Machine-readable error codes returned by the broker.
 *
 * These mirror the Rust `ErrorCode` enum 1:1. The client uses them
 * to construct specific exception subclasses and provide programmatic
 * access to the error category.
 *
 * Usage:
 *   if (parsed.code === BrokerErrorCode.SchemaTypeMismatch) { ... }
 */
export enum BrokerErrorCode {
  /** Consumer/publisher field type doesn't match queue schema. */
  SchemaTypeMismatch = 'SchemaTypeMismatch',
  /** Consumer has fields not present in queue schema. */
  SchemaExtraFields = 'SchemaExtraFields',
  /** JSON payload is missing required schema fields. */
  SchemaMissingFields = 'SchemaMissingFields',
  /** Re-declaration schema conflicts with existing queue schema. */
  SchemaConflict = 'SchemaConflict',
  /** Proto compilation failed (syntax error, etc.). */
  SchemaCompileFailed = 'SchemaCompileFailed',
  /** Unsupported schema type (not protobuf). */
  SchemaUnsupportedType = 'SchemaUnsupportedType',
  /** Schema validation on publish: wrong JSON value types. */
  ValidationTypeMismatch = 'ValidationTypeMismatch',
  /** Payload is not valid JSON. */
  ValidationInvalidJson = 'ValidationInvalidJson',
  /** Required AMQP argument missing (x-schema-type, x-schema-message). */
  MissingArgument = 'MissingArgument',
}
