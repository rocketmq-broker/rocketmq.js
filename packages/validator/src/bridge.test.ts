/**
 * Tests for the Zod bridge — ProtoType → ZodSchema mapping.
 *
 * Covers every ProtoType, valid payloads, invalid payloads,
 * and empty field lists.
 */

import { describe, it, expect } from 'vitest';
import { buildZodSchema } from './bridge.js';
import type { FieldMeta } from '@rocketmq/schema';

describe('buildZodSchema', () => {
  it('builds schema for string field', () => {
    const fields: FieldMeta[] = [{ name: 'id', protoType: 'string', number: 1 }];
    const schema = buildZodSchema(fields);
    expect(schema.parse({ id: 'abc' })).toEqual({ id: 'abc' });
  });

  it('rejects non-string for string field', () => {
    const fields: FieldMeta[] = [{ name: 'id', protoType: 'string', number: 1 }];
    const schema = buildZodSchema(fields);
    expect(() => schema.parse({ id: 123 })).toThrow();
  });

  it('builds schema for int32 field', () => {
    const fields: FieldMeta[] = [{ name: 'count', protoType: 'int32', number: 1 }];
    const schema = buildZodSchema(fields);
    expect(schema.parse({ count: 42 })).toEqual({ count: 42 });
  });

  it('rejects non-integer for int32 field', () => {
    const fields: FieldMeta[] = [{ name: 'count', protoType: 'int32', number: 1 }];
    const schema = buildZodSchema(fields);
    expect(() => schema.parse({ count: 3.14 })).toThrow();
  });

  it('builds schema for int64 field', () => {
    const fields: FieldMeta[] = [{ name: 'ts', protoType: 'int64', number: 1 }];
    const schema = buildZodSchema(fields);
    expect(schema.parse({ ts: 1234567890 })).toEqual({ ts: 1234567890 });
  });

  it('builds schema for uint32 field (nonnegative)', () => {
    const fields: FieldMeta[] = [{ name: 'age', protoType: 'uint32', number: 1 }];
    const schema = buildZodSchema(fields);
    expect(schema.parse({ age: 0 })).toEqual({ age: 0 });
    expect(() => schema.parse({ age: -1 })).toThrow();
  });

  it('builds schema for uint64 field (nonnegative)', () => {
    const fields: FieldMeta[] = [{ name: 'big', protoType: 'uint64', number: 1 }];
    const schema = buildZodSchema(fields);
    expect(schema.parse({ big: 999 })).toEqual({ big: 999 });
    expect(() => schema.parse({ big: -5 })).toThrow();
  });

  it('builds schema for float field', () => {
    const fields: FieldMeta[] = [{ name: 'rate', protoType: 'float', number: 1 }];
    const schema = buildZodSchema(fields);
    expect(schema.parse({ rate: 3.14 })).toEqual({ rate: 3.14 });
  });

  it('builds schema for double field', () => {
    const fields: FieldMeta[] = [{ name: 'precise', protoType: 'double', number: 1 }];
    const schema = buildZodSchema(fields);
    expect(schema.parse({ precise: 2.718281828 })).toEqual({ precise: 2.718281828 });
  });

  it('builds schema for bool field', () => {
    const fields: FieldMeta[] = [{ name: 'active', protoType: 'bool', number: 1 }];
    const schema = buildZodSchema(fields);
    expect(schema.parse({ active: true })).toEqual({ active: true });
    expect(() => schema.parse({ active: 'yes' })).toThrow();
  });

  it('builds schema for bytes field (Buffer)', () => {
    const fields: FieldMeta[] = [{ name: 'data', protoType: 'bytes', number: 1 }];
    const schema = buildZodSchema(fields);
    const buf = Buffer.from('hello');
    expect(schema.parse({ data: buf })).toEqual({ data: buf });
    expect(() => schema.parse({ data: 'not-a-buffer' })).toThrow();
  });

  it('builds schema with multiple fields', () => {
    const fields: FieldMeta[] = [
      { name: 'id', protoType: 'string', number: 1 },
      { name: 'qty', protoType: 'int32', number: 2 },
      { name: 'active', protoType: 'bool', number: 3 },
    ];
    const schema = buildZodSchema(fields);
    expect(schema.parse({ id: 'x', qty: 5, active: false })).toEqual({
      id: 'x',
      qty: 5,
      active: false,
    });
  });

  it('rejects payload with missing required field', () => {
    const fields: FieldMeta[] = [
      { name: 'id', protoType: 'string', number: 1 },
      { name: 'name', protoType: 'string', number: 2 },
    ];
    const schema = buildZodSchema(fields);
    expect(() => schema.parse({ id: '1' })).toThrow();
  });

  it('builds empty schema for no fields', () => {
    const schema = buildZodSchema([]);
    expect(schema.parse({})).toEqual({});
  });
});
