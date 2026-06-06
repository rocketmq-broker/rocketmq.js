import { describe, it, expect } from 'vitest';
import {
  parseBrokerError,
  extractReplyText,
  formatBrokerError,
  protoToTsType,
} from './error-parser.js';
import { BrokerErrorCode } from './error-codes.js';
import { SchemaValidationError } from './errors.js';

describe('protoToTsType', () => {
  it('maps numeric proto types to number', () => {
    expect(protoToTsType('double')).toBe('number');
    expect(protoToTsType('float')).toBe('number');
    expect(protoToTsType('int32')).toBe('number');
    expect(protoToTsType('int64')).toBe('number');
    expect(protoToTsType('uint32')).toBe('number');
    expect(protoToTsType('sint64')).toBe('number');
    expect(protoToTsType('fixed32')).toBe('number');
    expect(protoToTsType('sfixed64')).toBe('number');
  });

  it('maps bool to boolean', () => {
    expect(protoToTsType('bool')).toBe('boolean');
  });

  it('maps string to string', () => {
    expect(protoToTsType('string')).toBe('string');
  });

  it('maps bytes to Uint8Array', () => {
    expect(protoToTsType('bytes')).toBe('Uint8Array');
  });

  it('returns unknown types as-is', () => {
    expect(protoToTsType('customType')).toBe('customType');
  });
});

describe('parseBrokerError', () => {
  it('parses valid JSON with all fields', () => {
    const json = JSON.stringify({
      code: 'SchemaTypeMismatch',
      queue: 'test-queue',
      fields: [{ name: 'id', expected: 'double', got: 'string' }],
    });

    const result = parseBrokerError(json);

    expect(result).not.toBeNull();
    expect(result!.code).toBe(BrokerErrorCode.SchemaTypeMismatch);
    expect(result!.queue).toBe('test-queue');
    expect(result!.fields).toHaveLength(1);
    expect(result!.fields[0].name).toBe('id');
    expect(result!.fields[0].expected).toBe('double');
    expect(result!.fields[0].got).toBe('string');
  });

  it('returns null for plain AMQP strings', () => {
    expect(parseBrokerError('PRECONDITION_FAILED - no such queue')).toBeNull();
  });

  it('returns null for non-JSON starting with {', () => {
    expect(parseBrokerError('{not valid json')).toBeNull();
  });

  it('returns null when code is missing', () => {
    expect(parseBrokerError('{"queue":"q"}')).toBeNull();
  });

  it('returns null when queue is missing', () => {
    expect(parseBrokerError('{"code":"SchemaTypeMismatch"}')).toBeNull();
  });

  it('handles missing fields array gracefully', () => {
    const json = JSON.stringify({ code: 'SchemaConflict', queue: 'q' });
    const result = parseBrokerError(json);

    expect(result).not.toBeNull();
    expect(result!.fields).toEqual([]);
  });

  it('parses truncated flag', () => {
    const json = JSON.stringify({
      code: 'SchemaTypeMismatch',
      queue: 'q',
      fields: [{ name: 'a', expected: 'int32', got: 'string' }],
      truncated: true,
    });

    const result = parseBrokerError(json);
    expect(result!.truncated).toBe(true);
  });
});

describe('extractReplyText', () => {
  it('extracts reply text from amqplib error', () => {
    const err = new Error(
      'Channel closed by server: 406 (PRECONDITION-FAILED) with message "{"code":"SchemaTypeMismatch","queue":"q"}"',
    );
    const result = extractReplyText(err);
    expect(result).toBe('{"code":"SchemaTypeMismatch","queue":"q"}');
  });

  it('returns null for non-Error values', () => {
    expect(extractReplyText('string')).toBeNull();
    expect(extractReplyText(42)).toBeNull();
    expect(extractReplyText(null)).toBeNull();
  });

  it('returns null for errors without reply text pattern', () => {
    expect(extractReplyText(new Error('some other error'))).toBeNull();
  });
});

describe('formatBrokerError', () => {
  it('formats error with field details using TS types', () => {
    const msg = formatBrokerError({
      code: BrokerErrorCode.SchemaTypeMismatch,
      queue: 'orders',
      fields: [
        { name: 'id', expected: 'double', got: 'string' },
        { name: 'count', expected: 'int32', got: 'bool' },
      ],
      truncated: false,
    });

    expect(msg).toContain('[SchemaTypeMismatch]');
    expect(msg).toContain("Queue 'orders'");
    expect(msg).toContain('id: expected number, got string');
    expect(msg).toContain('count: expected number, got boolean');
  });

  it('formats error without fields', () => {
    const msg = formatBrokerError({
      code: BrokerErrorCode.SchemaConflict,
      queue: 'q',
      fields: [],
      truncated: false,
    });

    expect(msg).toBe("[SchemaConflict] Queue 'q'");
  });

  it('adds truncation notice', () => {
    const msg = formatBrokerError({
      code: BrokerErrorCode.SchemaTypeMismatch,
      queue: 'q',
      fields: [{ name: 'a', expected: 'int32', got: 'string' }],
      truncated: true,
    });

    expect(msg).toContain('(some fields omitted)');
  });
});

describe('SchemaValidationError', () => {
  it('is an instance of Error and SchemaValidationError', () => {
    const err = new SchemaValidationError(
      BrokerErrorCode.SchemaTypeMismatch,
      'test-queue',
      [{ name: 'id', expected: 'number', got: 'string' }],
      'test message',
    );

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SchemaValidationError);
    expect(err.code).toBe(BrokerErrorCode.SchemaTypeMismatch);
    expect(err.queue).toBe('test-queue');
    expect(err.fields).toHaveLength(1);
    expect(err.name).toBe('SchemaValidationError');
  });

  it('preserves cause', () => {
    const cause = new Error('original');
    const err = new SchemaValidationError('code', 'q', [], 'msg', cause);
    expect(err.cause).toBe(cause);
  });
});
