/**
 * Tests for schema metadata types.
 *
 * Verifies that the type definitions compile correctly and that
 * SchemaEntry can be constructed with all required fields.
 */

import { describe, it, expect } from 'vitest';
import type { ProtoType, FieldMeta, SchemaEntry } from './metadata.js';

describe('metadata types', () => {
  it('accepts all valid ProtoType values', () => {
    const types: ProtoType[] = [
      'string',
      'int32',
      'int64',
      'uint32',
      'uint64',
      'float',
      'double',
      'bool',
      'bytes',
    ];
    expect(types).toHaveLength(9);
  });

  it('constructs FieldMeta with required properties', () => {
    const field: FieldMeta = { name: 'id', protoType: 'string', number: 1 };
    expect(field.name).toBe('id');
    expect(field.protoType).toBe('string');
    expect(field.number).toBe(1);
  });

  it('constructs SchemaEntry with all properties', () => {
    class Stub {}
    const entry: SchemaEntry = {
      ctor: Stub,
      name: 'Stub',
      subject: 'test-subject',
      fields: [{ name: 'id', protoType: 'string', number: 1 }],
    };
    expect(entry.ctor).toBe(Stub);
    expect(entry.name).toBe('Stub');
    expect(entry.subject).toBe('test-subject');
    expect(entry.fields).toHaveLength(1);
  });

  it('constructs SchemaEntry without optional subject', () => {
    class Stub {}
    const entry: SchemaEntry = {
      ctor: Stub,
      name: 'Stub',
      fields: [],
    };
    expect(entry.subject).toBeUndefined();
    expect(entry.fields).toHaveLength(0);
  });
});
