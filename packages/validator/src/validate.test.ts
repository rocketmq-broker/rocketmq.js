/**
 * Tests for validatePayload().
 *
 * Covers: valid payload, invalid payload, missing schema (passthrough),
 * and issue formatting.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validatePayload } from './validate.js';
import { SchemaRegistry } from '@rocketmq/schema';
import type { SchemaEntry } from '@rocketmq/schema';

describe('validatePayload', () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    registry = new SchemaRegistry();
  });

  it('returns ok:true when no schema registered for queue', () => {
    const result = validatePayload(registry, 'unknown-queue', { any: 'data' });
    expect(result.ok).toBe(true);
  });

  it('returns ok:true for valid payload matching schema', () => {
    class Order {}
    const entry: SchemaEntry = {
      ctor: Order,
      name: 'Order',
      fields: [
        { name: 'id', protoType: 'string', number: 1 },
        { name: 'qty', protoType: 'int32', number: 2 },
      ],
    };
    registry.register('orders', entry);

    const result = validatePayload(registry, 'orders', { id: '1', qty: 5 });
    expect(result.ok).toBe(true);
  });

  it('returns ok:false with issues for invalid payload', () => {
    class Order {}
    const entry: SchemaEntry = {
      ctor: Order,
      name: 'Order',
      fields: [
        { name: 'id', protoType: 'string', number: 1 },
        { name: 'qty', protoType: 'int32', number: 2 },
      ],
    };
    registry.register('orders', entry);

    // Missing qty, wrong type for id
    const result = validatePayload(registry, 'orders', { id: 123 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.includes('id'))).toBe(true);
    }
  });

  it('returns ok:false for completely wrong payload shape', () => {
    class Msg {}
    const entry: SchemaEntry = {
      ctor: Msg,
      name: 'Msg',
      fields: [{ name: 'content', protoType: 'string', number: 1 }],
    };
    registry.register('messages', entry);

    const result = validatePayload(registry, 'messages', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes('content'))).toBe(true);
    }
  });

  it('formats issues with field paths', () => {
    class Item {}
    const entry: SchemaEntry = {
      ctor: Item,
      name: 'Item',
      fields: [{ name: 'price', protoType: 'double', number: 1 }],
    };
    registry.register('items', entry);

    const result = validatePayload(registry, 'items', { price: 'not-a-number' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Format is "path: message"
      expect(result.issues[0]).toMatch(/price/);
    }
  });

  it('handles non-ZodError exceptions as string issues', async () => {
    // WHY: covers the catch branch at line 53 where err is not a ZodError.
    // We inject a schema entry with a field type that will cause buildZodSchema
    // to produce a schema, then monkey-patch parse to throw a plain Error.
    class Broken {}
    const entry: SchemaEntry = {
      ctor: Broken,
      name: 'Broken',
      fields: [{ name: 'x', protoType: 'string', number: 1 }],
    };
    registry.register('broken-q', entry);

    // Import and mock buildZodSchema to throw a non-Zod error
    const bridgeMod = await import('./bridge.js');
    const { vi: viUtil } = await import('vitest');
    const spy = viUtil.spyOn(bridgeMod, 'buildZodSchema').mockReturnValue({
      parse: () => {
        throw new TypeError('unexpected non-zod error');
      },
    } as never);

    const result = validatePayload(registry, 'broken-q', { x: 'valid' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toContain('TypeError');
    }

    spy.mockRestore();
  });
});
