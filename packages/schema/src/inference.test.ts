import { describe, it, expect } from 'vitest';
import { inferFromConstructor, inferFromValue, inferFromReflectMetadata } from './inference.js';
import { defaultRegistry } from './registry.js';

describe('inference', () => {
  describe('inferFromConstructor', () => {
    it('infers proto types from JS constructors', () => {
      expect(inferFromConstructor(Number)).toBe('double');
      expect(inferFromConstructor(Boolean)).toBe('bool');
      expect(inferFromConstructor(Date)).toBe('google.protobuf.Timestamp');
      expect(inferFromConstructor(Array)).toBe('bytes');
      expect(inferFromConstructor(Object)).toBe('bytes');
      expect(inferFromConstructor(String)).toBe('string');
    });

    it('infers from schema constructors', () => {
      class NestedSchema {}
      defaultRegistry.registerSchema(NestedSchema);
      expect(inferFromConstructor(NestedSchema)).toBe('NestedSchema');
    });
  });

  describe('inferFromValue', () => {
    it('infers proto types from JS values', () => {
      expect(inferFromValue(1)).toBe('double');
      expect(inferFromValue(true)).toBe('bool');
      expect(inferFromValue(new Date())).toBe('google.protobuf.Timestamp');
      expect(inferFromValue([])).toBe('bytes');
      expect(inferFromValue({})).toBe('bytes');
      expect(inferFromValue('hello')).toBe('string');
      expect(inferFromValue(undefined)).toBe('string');
    });

    it('infers from schema instances', () => {
      class NestedSchema {}
      defaultRegistry.registerSchema(NestedSchema);
      expect(inferFromValue(new NestedSchema())).toBe('NestedSchema');
    });
  });

  describe('inferFromReflectMetadata', () => {
    it('falls back to string if design:type is missing', () => {
      expect(inferFromReflectMetadata({}, 'key')).toBe('string');
    });
  });
});
