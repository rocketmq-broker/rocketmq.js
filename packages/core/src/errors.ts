/**
 * Error hierarchy for the RocketMQ SDK.
 *
 * Every error includes the offending context (queue name, schema name, etc.)
 * and preserves the original cause via the standard `cause` property.
 *
 * Usage:
 *   try { ... } catch (err) {
 *     if (err instanceof PublishError) console.error(err.queue);
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
    public readonly payload: unknown,
    cause?: unknown,
  ) {
    super(`Failed to publish payload to '${queue}': ${JSON.stringify(payload)}`, cause);
    this.name = 'PublishError';
  }
}

export class ConsumeError extends RocketMQError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ConsumeError';
  }
}

export class SerializationError extends RocketMQError {
  constructor(
    public readonly payload: unknown,
    cause?: unknown,
  ) {
    super(`Serialization error for payload: ${JSON.stringify(payload)}`, cause);
    this.name = 'SerializationError';
  }
}

export class SchemaError extends RocketMQError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'SchemaError';
  }
}

/**
 * Schema-specific error with structured details from the broker.
 *
 * Contains the error code, queue name, and per-field details
 * so callers can programmatically inspect what went wrong.
 * Field types use TypeScript names (number, string, boolean).
 *
 * Usage:
 *   catch (err) {
 *     if (err instanceof SchemaValidationError) {
 *       console.log(err.code);     // 'SchemaTypeMismatch'
 *       console.log(err.queue);    // 'zod-notifications'
 *       console.log(err.fields);   // [{ name: 'id', expected: 'number', got: 'string' }]
 *     }
 *   }
 */
export class SchemaValidationError extends SchemaError {
  constructor(
    public readonly code: string,
    public readonly queue: string,
    public readonly fields: ReadonlyArray<{
      readonly name: string;
      readonly expected: string;
      readonly got: string;
    }>,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'SchemaValidationError';
  }
}

export class TimeoutError extends RocketMQError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'TimeoutError';
  }
}
