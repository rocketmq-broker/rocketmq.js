/**
 * Tests for zodToFields() — Zod schema → FieldMeta conversion.
 *
 * Covers: string, number (double/int32), boolean, bigint, date, enum,
 * optional, array (repeated), default-wrapped, nullable-wrapped,
 * nested object, and empty schema.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodToFields, zodTypeToProto } from './zod-to-fields.js';

describe('zodTypeToProto', () => {
  it('maps z.string() to "string"', () => {
    expect(zodTypeToProto(z.string())).toBe('string');
  });

  it('maps z.boolean() to "bool"', () => {
    expect(zodTypeToProto(z.boolean())).toBe('bool');
  });

  it('maps z.number() to "double" by default', () => {
    expect(zodTypeToProto(z.number())).toBe('double');
  });

  it('maps z.number().int() to "int32"', () => {
    expect(zodTypeToProto(z.number().int())).toBe('int32');
  });

  it('maps z.bigint() to "int64"', () => {
    expect(zodTypeToProto(z.bigint())).toBe('int64');
  });

  it('maps z.date() to Timestamp', () => {
    expect(zodTypeToProto(z.date())).toBe('google.protobuf.Timestamp');
  });

  it('maps z.enum() to "string"', () => {
    expect(zodTypeToProto(z.enum(['A', 'B']))).toBe('string');
  });

  it('maps z.object() to "bytes" (opaque nested)', () => {
    expect(zodTypeToProto(z.object({ x: z.string() }))).toBe('bytes');
  });

  it('unwraps z.optional() before mapping', () => {
    expect(zodTypeToProto(z.string().optional())).toBe('string');
  });

  it('unwraps z.nullable() before mapping', () => {
    expect(zodTypeToProto(z.number().nullable())).toBe('double');
  });

  it('unwraps z.default() before mapping', () => {
    expect(zodTypeToProto(z.boolean().default(false))).toBe('bool');
  });

  it('maps z.array(z.string()) element type', () => {
    expect(zodTypeToProto(z.array(z.string()))).toBe('string');
  });

  it('unwraps z.branded() before mapping', () => {
    const branded = z.string().brand<'Email'>();
    expect(zodTypeToProto(branded)).toBe('string');
  });

  it('falls back to "string" for unknown Zod types', () => {
    // z.undefined() is not in the explicit mapping — should fall back to "string"
    expect(zodTypeToProto(z.undefined())).toBe('string');
  });
});

describe('zodToFields', () => {
  it('converts a simple object to ordered FieldMeta[]', () => {
    const schema = z.object({
      id: z.string(),
      content: z.string(),
      timestamp: z.number(),
    });

    const fields = zodToFields(schema);
    expect(fields).toHaveLength(3);
    expect(fields[0]).toMatchObject({ name: 'id', protoType: 'string', number: 1 });
    expect(fields[1]).toMatchObject({ name: 'content', protoType: 'string', number: 2 });
    expect(fields[2]).toMatchObject({ name: 'timestamp', protoType: 'double', number: 3 });
  });

  it('marks optional fields', () => {
    const schema = z.object({
      name: z.string(),
      nickname: z.string().optional(),
    });

    const fields = zodToFields(schema);
    expect(fields[0].optional).toBeFalsy();
    expect(fields[1].optional).toBe(true);
  });

  it('marks array fields as repeated', () => {
    const schema = z.object({
      tags: z.array(z.string()),
    });

    const fields = zodToFields(schema);
    expect(fields[0].repeated).toBe(true);
    expect(fields[0].protoType).toBe('string');
  });

  it('handles mixed types in one schema', () => {
    const schema = z.object({
      id: z.number().int(),
      active: z.boolean(),
      createdAt: z.date(),
      balance: z.bigint(),
    });

    const fields = zodToFields(schema);
    expect(fields[0].protoType).toBe('int32');
    expect(fields[1].protoType).toBe('bool');
    expect(fields[2].protoType).toBe('google.protobuf.Timestamp');
    expect(fields[3].protoType).toBe('int64');
  });

  it('throws for empty Zod schema', () => {
    const schema = z.object({});
    expect(() => zodToFields(schema)).toThrow('Zod schema has no fields');
  });

  it('unwraps default + nullable combo', () => {
    const schema = z.object({
      score: z.number().nullable().default(0),
    });

    const fields = zodToFields(schema);
    expect(fields[0].protoType).toBe('double');
  });
});
