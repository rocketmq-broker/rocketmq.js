/**
 * Tests for SchemaRegistry.
 *
 * Covers register/lookup, field store CRUD, subject store,
 * and listAll enumeration.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { SchemaEntry } from './metadata.js';
import { SchemaRegistry } from './registry.js';

describe('SchemaRegistry', () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    registry = new SchemaRegistry();
  });

  describe('register / lookup', () => {
    it('stores and retrieves a schema entry by queue name', () => {
      class Order {}
      const entry: SchemaEntry = {
        ctor: Order,
        name: 'Order',
        fields: [{ name: 'id', protoType: 'string', number: 1 }],
      };
      registry.register('orders', entry);
      expect(registry.lookup('orders')).toBe(entry);
    });

    it('returns undefined for unregistered queue', () => {
      expect(registry.lookup('nonexistent')).toBeUndefined();
    });

    it('overwrites previous entry on re-registration', () => {
      class V1 {}
      class V2 {}
      const entry1: SchemaEntry = { ctor: V1, name: 'V1', fields: [] };
      const entry2: SchemaEntry = { ctor: V2, name: 'V2', fields: [] };
      registry.register('q', entry1);
      registry.register('q', entry2);
      expect(registry.lookup('q')).toBe(entry2);
    });
  });

  describe('listAll', () => {
    it('returns empty array when nothing registered', () => {
      expect(registry.listAll()).toEqual([]);
    });

    it('returns all registered entries', () => {
      class A {}
      class B {}
      const a: SchemaEntry = { ctor: A, name: 'A', fields: [] };
      const b: SchemaEntry = { ctor: B, name: 'B', fields: [] };
      registry.register('qa', a);
      registry.register('qb', b);
      expect(registry.listAll()).toHaveLength(2);
      expect(registry.listAll()).toContain(a);
      expect(registry.listAll()).toContain(b);
    });
  });

  describe('subject store', () => {
    it('stores and retrieves subject prefix', () => {
      class X {}
      registry.setSubject(X, 'my-subject');
      expect(registry.getSubject(X)).toBe('my-subject');
    });

    it('returns undefined for class without subject', () => {
      class Y {}
      expect(registry.getSubject(Y)).toBeUndefined();
    });
  });

  describe('field store', () => {
    it('creates empty field list on first access', () => {
      class Z {}
      const fields = registry.getOrCreateFields(Z);
      expect(fields).toEqual([]);
    });

    it('returns same array on subsequent calls', () => {
      class W {}
      const first = registry.getOrCreateFields(W);
      first.push({ name: 'x', protoType: 'int32', number: 1 });
      const second = registry.getOrCreateFields(W);
      expect(second).toBe(first);
      expect(second).toHaveLength(1);
    });

    it('getFields returns empty for unknown class', () => {
      class Unknown {}
      expect(registry.getFields(Unknown)).toEqual([]);
    });

    it('getFields returns registered fields', () => {
      class F {}
      const fields = registry.getOrCreateFields(F);
      fields.push({ name: 'a', protoType: 'string', number: 1 });
      expect(registry.getFields(F)).toEqual([{ name: 'a', protoType: 'string', number: 1 }]);
    });
  });
});
