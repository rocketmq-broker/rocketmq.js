/**
 * Tests for @Schema() and @Field() decorators.
 *
 * Uses the defaultRegistry singleton to verify that decorators
 * register metadata correctly. Each test uses unique classes to
 * avoid cross-contamination in the shared singleton.
 */

import { describe, it, expect } from 'vitest';
import { Schema, Field } from './decorators.js';
import { defaultRegistry } from './registry.js';

describe('@Schema() decorator', () => {
  it('registers field list for a decorated class', () => {
    @Schema()
    class Alpha {
      @Field()
      id!: string;
    }
    // Force field registration via instantiation
    new Alpha();
    const fields = defaultRegistry.getFields(Alpha);
    expect(fields.length).toBeGreaterThanOrEqual(1);
    expect(fields[0].name).toBe('id');
  });

  it('stores subject prefix when provided', () => {
    @Schema('my-subject')
    class Beta {
      @Field()
      name!: string;
    }
    new Beta();
    expect(defaultRegistry.getSubject(Beta)).toBe('my-subject');
  });

  it('does not set subject when omitted', () => {
    @Schema()
    class Gamma {
      @Field()
      val!: string;
    }
    new Gamma();
    expect(defaultRegistry.getSubject(Gamma)).toBeUndefined();
  });

  it('creates field list even with no @Field() decorators', () => {
    @Schema()
    class Empty {}
    // getOrCreateFields was called by @Schema
    const fields = defaultRegistry.getFields(Empty);
    expect(fields).toEqual([]);
  });
});

describe('@Field() decorator', () => {
  it("defaults to protoType 'string'", () => {
    @Schema()
    class DefaultType {
      @Field()
      name!: string;
    }
    new DefaultType();
    const fields = defaultRegistry.getFields(DefaultType);
    expect(fields[0].protoType).toBe('string');
  });

  it('respects explicit type option', () => {
    @Schema()
    class ExplicitType {
      @Field({ type: 'int64' })
      timestamp!: number;
    }
    new ExplicitType();
    const fields = defaultRegistry.getFields(ExplicitType);
    expect(fields[0].protoType).toBe('int64');
  });

  it('assigns sequential field numbers', () => {
    @Schema()
    class Multi {
      @Field()
      a!: string;

      @Field()
      b!: string;

      @Field()
      c!: string;
    }
    new Multi();
    const fields = defaultRegistry.getFields(Multi);
    expect(fields.map((f) => f.number)).toEqual([1, 2, 3]);
  });

  it('prevents duplicate registrations from multiple instances', () => {
    @Schema()
    class NoDup {
      @Field()
      id!: string;
    }
    new NoDup();
    new NoDup();
    new NoDup();
    const fields = defaultRegistry.getFields(NoDup);
    expect(fields.filter((f) => f.name === 'id')).toHaveLength(1);
  });
});
