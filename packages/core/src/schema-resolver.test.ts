/**
 * Tests for schema-resolver — tri-input proto3 resolution.
 *
 * Verifies that resolveProto handles Constructor (decorator), ZodSchemaInput
 * (wrapper), and raw ZodObject paths. Also tests queueNameToMessageName and
 * isConstructorInput discrimination.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Schema, Field } from '@rocketmq/schema';
import {
  resolveProto,
  isConstructorInput,
  queueNameToMessageName,
  type SchemaInput,
} from './schema-resolver.js';

describe('resolveProto', () => {
  it('resolves a decorator class to proto3', () => {
    @Schema()
    class ResolverTest {
      @Field()
      id!: string;
    }
    new ResolverTest();

    const result = resolveProto(ResolverTest, 'test-q');
    expect(result.messageName).toBe('ResolverTest');
    expect(result.proto).toContain('syntax = "proto3"');
    expect(result.proto).toContain('message ResolverTest {');
    expect(result.proto).toContain('string id = 1;');
  });

  it('resolves a ZodSchemaInput wrapper to proto3', () => {
    const zodInput = {
      name: 'ZodOrder',
      schema: z.object({
        id: z.string(),
        qty: z.number().int(),
      }),
    };

    const result = resolveProto(zodInput, 'orders');
    expect(result.messageName).toBe('ZodOrder');
    expect(result.proto).toContain('message ZodOrder {');
    expect(result.proto).toContain('string id = 1;');
    expect(result.proto).toContain('int32 qty = 2;');
  });

  it('resolves a raw ZodObject using queue name as message name', () => {
    const schema = z.object({
      title: z.string(),
      count: z.number().int(),
    });

    const result = resolveProto(schema, 'my-events');
    expect(result.messageName).toBe('MyEvents');
    expect(result.proto).toContain('message MyEvents {');
    expect(result.proto).toContain('string title = 1;');
    expect(result.proto).toContain('int32 count = 2;');
  });

  it('produces different proto for different Zod schemas', () => {
    const input1 = { name: 'A', schema: z.object({ x: z.string() }) };
    const input2 = { name: 'B', schema: z.object({ y: z.number() }) };

    expect(resolveProto(input1, 'q').proto).not.toBe(resolveProto(input2, 'q').proto);
  });
});

describe('queueNameToMessageName', () => {
  it('converts kebab-case to PascalCase', () => {
    expect(queueNameToMessageName('my-queue')).toBe('MyQueue');
  });

  it('converts snake_case to PascalCase', () => {
    expect(queueNameToMessageName('order_items')).toBe('OrderItems');
  });

  it('converts dot-separated to PascalCase', () => {
    expect(queueNameToMessageName('user.events')).toBe('UserEvents');
  });

  it('handles single word', () => {
    expect(queueNameToMessageName('orders')).toBe('Orders');
  });

  it('handles already PascalCase', () => {
    expect(queueNameToMessageName('Orders')).toBe('Orders');
  });
});

describe('isConstructorInput', () => {
  it('returns true for a class constructor', () => {
    class MyClass {}
    expect(isConstructorInput(MyClass as SchemaInput)).toBe(true);
  });

  it('returns false for a ZodSchemaInput wrapper', () => {
    const zodInput = {
      name: 'Test',
      schema: z.object({ id: z.string() }),
    };
    expect(isConstructorInput(zodInput as SchemaInput)).toBe(false);
  });

  it('returns false for a raw ZodObject', () => {
    const raw = z.object({ id: z.string() });
    expect(isConstructorInput(raw as SchemaInput)).toBe(false);
  });
});
