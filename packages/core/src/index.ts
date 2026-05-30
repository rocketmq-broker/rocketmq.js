// Re-export decorators so users only need one import
export { Schema, Field } from '@rocketmq/schema';
export type { ProtoType, FieldMeta, SchemaEntry } from '@rocketmq/schema';

// Re-export serializer interface for custom implementations
export type { Serializer } from '@rocketmq/serializer';

// Re-export AMQP types needed by consumers
export type { ConsumeMessage } from '@rocketmq/amqp';

// Core API
export { connect, RocketMQ, type RocketOptions } from './client.js';
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
  TimeoutError,
} from './errors.js';
