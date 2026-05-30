/**
 * Error hierarchy for the RocketMQ SDK.
 *
 * Every error includes the offending context (queue name, schema name, etc.)
 * and preserves the original cause via the standard `cause` property.
 *
 * Usage:
 *   try { ... } catch (err) {
 *     if (err instanceof ValidationError) console.error(err.issues);
 *   }
 */

export class RocketMQError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'RocketMQError';
  }
}

export class ConnectionError extends RocketMQError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ConnectionError';
  }
}

export class QueueError extends RocketMQError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'QueueError';
  }
}

export class PublishError extends RocketMQError {
  constructor(
    public readonly queue: string,
    cause?: unknown,
  ) {
    super(`Failed to publish to '${queue}'`, cause);
    this.name = 'PublishError';
  }
}

export class ConsumeError extends RocketMQError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ConsumeError';
  }
}

export class ValidationError extends RocketMQError {
  constructor(
    public readonly schema: string,
    public readonly issues: string[],
  ) {
    super(`Validation failed for schema '${schema}': ${issues.join(', ')}`);
    this.name = 'ValidationError';
  }
}

export class SerializationError extends RocketMQError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'SerializationError';
  }
}

export class SchemaError extends RocketMQError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'SchemaError';
  }
}

export class TimeoutError extends RocketMQError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'TimeoutError';
  }
}
