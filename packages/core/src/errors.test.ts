/**
 * Tests for the error hierarchy.
 *
 * Covers every error class: construction, message formatting,
 * name property, cause chaining, and custom properties.
 */

import { describe, it, expect } from 'vitest';
import {
  RocketMQError,
  ConnectionError,
  QueueError,
  PublishError,
  ConsumeError,
  SerializationError,
  SchemaError,
  TimeoutError,
} from './errors.js';

describe('RocketMQError', () => {
  it('sets message and name', () => {
    const err = new RocketMQError('test error');
    expect(err.message).toBe('test error');
    expect(err.name).toBe('RocketMQError');
    expect(err).toBeInstanceOf(Error);
  });

  it('preserves cause', () => {
    const cause = new Error('root cause');
    const err = new RocketMQError('wrapped', cause);
    expect(err.cause).toBe(cause);
  });
});

describe('ConnectionError', () => {
  it('extends RocketMQError', () => {
    const err = new ConnectionError('conn failed');
    expect(err).toBeInstanceOf(RocketMQError);
    expect(err.name).toBe('ConnectionError');
  });

  it('preserves cause', () => {
    const cause = new Error('ECONNREFUSED');
    const err = new ConnectionError('failed', cause);
    expect(err.cause).toBe(cause);
  });
});

describe('QueueError', () => {
  it('extends RocketMQError', () => {
    const err = new QueueError('queue fail');
    expect(err).toBeInstanceOf(RocketMQError);
    expect(err.name).toBe('QueueError');
  });

  it('preserves cause', () => {
    const cause = new Error('PRECONDITION_FAILED');
    const err = new QueueError('failed', cause);
    expect(err.cause).toBe(cause);
  });
});

describe('PublishError', () => {
  it('formats message with queue name and payload', () => {
    const err = new PublishError('orders', { id: 1 });
    expect(err.message).toBe('Failed to publish payload to \'orders\': {"id":1}');
    expect(err.queue).toBe('orders');
    expect(err.name).toBe('PublishError');
    expect(err.payload).toEqual({ id: 1 });
  });

  it('preserves cause', () => {
    const cause = new Error('channel closed');
    const err = new PublishError('q', { id: 1 }, cause);
    expect(err.cause).toBe(cause);
  });
});

describe('ConsumeError', () => {
  it('extends RocketMQError', () => {
    const err = new ConsumeError('consume failed');
    expect(err).toBeInstanceOf(RocketMQError);
    expect(err.name).toBe('ConsumeError');
  });

  it('preserves cause', () => {
    const cause = new Error('timeout');
    const err = new ConsumeError('consume failed', cause);
    expect(err.cause).toBe(cause);
  });
});

describe('SerializationError', () => {
  it('extends RocketMQError and includes payload', () => {
    const err = new SerializationError({ bad: 'data' });
    expect(err).toBeInstanceOf(RocketMQError);
    expect(err.name).toBe('SerializationError');
    expect(err.message).toBe('Serialization error for payload: {"bad":"data"}');
    expect(err.payload).toEqual({ bad: 'data' });
  });

  it('preserves cause', () => {
    const cause = new Error('parse error');
    const err = new SerializationError('data', cause);
    expect(err.cause).toBe(cause);
  });
});

describe('SchemaError', () => {
  it('extends RocketMQError', () => {
    const err = new SchemaError('no fields');
    expect(err).toBeInstanceOf(RocketMQError);
    expect(err.name).toBe('SchemaError');
  });

  it('preserves cause', () => {
    const cause = new Error('compile failed');
    const err = new SchemaError('schema issue', cause);
    expect(err.cause).toBe(cause);
  });
});

describe('TimeoutError', () => {
  it('extends RocketMQError', () => {
    const err = new TimeoutError('timed out after 5s');
    expect(err).toBeInstanceOf(RocketMQError);
    expect(err.name).toBe('TimeoutError');
  });

  it('preserves cause', () => {
    const cause = new Error('deadline');
    const err = new TimeoutError('timeout', cause);
    expect(err.cause).toBe(cause);
  });
});
