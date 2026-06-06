/**
 * Tests for ZodSchemaInput type guard and types.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { isZodSchemaInput, isRawZodObject } from './types.js';

describe('isZodSchemaInput', () => {
  it('returns true for valid ZodSchemaInput', () => {
    const input = {
      name: 'Notification',
      schema: z.object({ id: z.string() }),
    };
    expect(isZodSchemaInput(input)).toBe(true);
  });

  it('returns false for a plain class constructor', () => {
    class Foo {}
    expect(isZodSchemaInput(Foo)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isZodSchemaInput(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isZodSchemaInput(undefined)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isZodSchemaInput('Notification')).toBe(false);
  });

  it('returns false for object with name but no schema', () => {
    expect(isZodSchemaInput({ name: 'Foo' })).toBe(false);
  });

  it('returns false for object with schema but no name', () => {
    expect(isZodSchemaInput({ schema: z.object({ id: z.string() }) })).toBe(false);
  });

  it('returns false for object where schema is not a ZodObject', () => {
    expect(isZodSchemaInput({ name: 'Foo', schema: z.string() })).toBe(false);
  });

  it('returns false for a raw ZodObject (no name wrapper)', () => {
    expect(isZodSchemaInput(z.object({ id: z.string() }))).toBe(false);
  });
});

describe('isRawZodObject', () => {
  it('returns true for z.object()', () => {
    expect(isRawZodObject(z.object({ id: z.string() }))).toBe(true);
  });

  it('returns false for a ZodSchemaInput wrapper', () => {
    expect(isRawZodObject({ name: 'Foo', schema: z.object({}) })).toBe(false);
  });

  it('returns false for a class constructor', () => {
    class Foo {}
    expect(isRawZodObject(Foo)).toBe(false);
  });

  it('returns false for a scalar Zod type', () => {
    expect(isRawZodObject(z.string())).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRawZodObject(null)).toBe(false);
  });
});
