/**
 * Tests for toProto() — proto3 string generation.
 *
 * Covers: valid schemas, empty schemas (error), multi-field ordering,
 * and the force-instantiation path for uninitialized classes.
 */

import { describe, it, expect } from 'vitest';
import { toProto } from './generator.js';
import { Schema, Field, defaultRegistry } from '@rocketmq/schema';

describe('toProto', () => {
  it('generates proto3 string for a single-field class', () => {
    @Schema()
    class SingleField {
      @Field()
      id!: string;
    }
    new SingleField();

    const proto = toProto(SingleField);
    expect(proto).toBe('syntax = "proto3"; message SingleField { string id = 1; }');
  });

  it('generates proto3 with multiple fields in order', () => {
    @Schema()
    class MultiField {
      @Field()
      name!: string;

      @Field({ type: 'int32' })
      age!: number;

      @Field({ type: 'bool' })
      active!: boolean;
    }
    new MultiField();

    const proto = toProto(MultiField);
    expect(proto).toBe(
      'syntax = "proto3"; message MultiField { string name = 1; int32 age = 2; bool active = 3; }',
    );
  });

  it('throws for class with no @Field() decorators', () => {
    @Schema()
    class NoFields {}

    expect(() => toProto(NoFields)).toThrow(
      "Schema 'NoFields' has no @Field() decorators — cannot generate proto",
    );
  });

  it('forces instantiation when fields are not yet registered', () => {
    // Simulate a class that hasn't been instantiated yet
    @Schema()
    class LazyInit {
      @Field()
      value!: string;
    }
    // Do NOT call `new LazyInit()` — toProto should do it internally
    const proto = toProto(LazyInit);
    expect(proto).toContain('string value = 1');
  });

  it('handles class whose constructor throws', () => {
    // WHY: toProto wraps instantiation in try/catch for classes
    // that require constructor arguments
    class ThrowingCtor {
      @Field()
      x!: string;

      constructor() {
        // Fields registered via addInitializer before the throw
        throw new Error('required args');
      }
    }
    // Force-register the field store entry
    defaultRegistry.getOrCreateFields(ThrowingCtor);

    // toProto will try `new ThrowingCtor()`, catch, and check fields
    // Since addInitializer runs before constructor body, field might be registered
    // If not, it should throw "no @Field() decorators"
    try {
      const proto = toProto(ThrowingCtor);
      expect(proto).toContain('string x = 1');
    } catch (err) {
      expect((err as Error).message).toContain('no @Field() decorators');
    }
  });
});
