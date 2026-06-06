// Re-export decorators so users only need one import
export { Schema, Field } from '@rocketmq/schema';
export type { ProtoType, FieldMeta, SchemaEntry } from '@rocketmq/schema';

// Re-export Zod schema utilities so users can use either style
export {
  zodToProto,
  zodToFields,
  isZodSchemaInput,
  isRawZodObject,
  type ZodSchemaInput,
} from '@rocketmq/zod';

// Re-export schema resolver types
export { type SchemaInput } from './schema-resolver.js';

// Re-export serializer interface for custom implementations
export type { Serializer } from '@rocketmq/serializer';

// Re-export AMQP types needed by consumers
export type { ConsumeMessage } from '@rocketmq/amqp';

// Core API
export {
  connect,
  RocketMQ,
  type RocketOptions,
  type RocketAssertQueueOptions,
  type RocketConsumeOptions,
} from './client.js';
export { QueueHandle } from './queue-handle.js';

// Errors
export {
  RocketMQError,
  ConnectionError,
  QueueError,
  PublishError,
  ConsumeError,
  SerializationError,
  SchemaError,
  SchemaValidationError,
  TimeoutError,
} from './errors.js';

// Error codes and parser for structured broker errors
export { BrokerErrorCode } from './error-codes.js';
export {
  parseBrokerError,
  extractReplyText,
  formatBrokerError,
  protoToTsType,
  type BrokerErrorPayload,
  type FieldErrorDetail,
} from './error-parser.js';
