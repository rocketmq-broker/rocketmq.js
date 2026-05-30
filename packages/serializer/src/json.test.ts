/**
 * Tests for JsonSerializer.
 *
 * Covers serialize/deserialize round-trip, content type,
 * and edge cases (empty object, nested, arrays).
 */

import { describe, it, expect } from 'vitest';
import { JsonSerializer } from './json.js';

describe('JsonSerializer', () => {
  const serializer = new JsonSerializer();

  it('has content type application/json', () => {
    expect(serializer.contentType).toBe('application/json');
  });

  it('serializes an object to a Buffer', () => {
    const buf = serializer.serialize({ id: '1', qty: 5 });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe('{"id":"1","qty":5}');
  });

  it('deserializes a Buffer back to the original object', () => {
    const original = { name: 'Alice', age: 30 };
    const buf = serializer.serialize(original);
    const result = serializer.deserialize(buf);
    expect(result).toEqual(original);
  });

  it('round-trips empty object', () => {
    const buf = serializer.serialize({});
    expect(serializer.deserialize(buf)).toEqual({});
  });

  it('round-trips nested objects', () => {
    const nested = { a: { b: { c: 1 } } };
    const buf = serializer.serialize(nested);
    expect(serializer.deserialize(buf)).toEqual(nested);
  });

  it('round-trips arrays', () => {
    const arr = [1, 2, 3];
    const buf = serializer.serialize(arr);
    expect(serializer.deserialize(buf)).toEqual(arr);
  });

  it('serializes null and primitives', () => {
    expect(serializer.deserialize(serializer.serialize(null))).toBeNull();
    expect(serializer.deserialize(serializer.serialize(42))).toBe(42);
    expect(serializer.deserialize(serializer.serialize('hello'))).toBe('hello');
    expect(serializer.deserialize(serializer.serialize(true))).toBe(true);
  });
});
