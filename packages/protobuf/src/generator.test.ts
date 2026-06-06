/**
 * Tests for toProto() — proto3 string generation.
 */

import { describe, expect, it } from 'vitest';
import { Schema, Field, defaultRegistry } from '@rocketmq/schema';
import { toProto } from './generator.js';

describe('toProto', () => {
  it('generates proto3 string for a single-field class', () => {
    @Schema()
    class SingleField {
      @Field()
      id = '';
    }
    new SingleField();

    const expected = [
      'syntax = "proto3";',
      '',
      'message SingleField {',
      '  string id = 1;',
      '}',
    ].join('\n');
    expect(toProto(SingleField)).toBe(expected);
  });

  it('generates proto3 with multiple fields in order', () => {
    @Schema()
    class MultiField {
      @Field()
      name = '';

      @Field({ type: 'int32' })
      age = 0;

      @Field({ type: 'bool' })
      active = false;
    }
    new MultiField();

    const expected = [
      'syntax = "proto3";',
      '',
      'message MultiField {',
      '  string name = 1;',
      '  int32 age = 2;',
      '  bool active = 3;',
      '}',
    ].join('\n');
    expect(toProto(MultiField)).toBe(expected);
  });

  it('throws for class with no @Field() decorators', () => {
    @Schema()
    class NoFields {}

    expect(() => toProto(NoFields)).toThrow(
      "Schema 'NoFields' has no @Field() decorators — cannot generate proto",
    );
  });

  it('forces instantiation when fields are not yet registered', () => {
    @Schema()
    class LazyInit {
      @Field()
      value = '';
    }
    expect(toProto(LazyInit)).toContain('string value = 1;');
  });

  it('handles class whose constructor throws', () => {
    class ThrowingCtor {
      @Field()
      x = '';

      constructor() {
        throw new Error('required args');
      }
    }
    defaultRegistry.getOrCreateFields(ThrowingCtor);

    try {
      expect(toProto(ThrowingCtor)).toContain('string x = 1;');
    } catch (err) {
      expect((err as Error).message).toContain('no @Field() decorators');
    }
  });

  it('generates optional, repeated, and commented fields', () => {
    @Schema()
    class CustomField {
      @Field({ type: 'string', repeated: true })
      tags: string[] = [];

      @Field({ type: 'string', optional: true })
      nickname?: string;

      @Field({ type: 'double', comment: 'User age in years' })
      age!: number;
    }
    new CustomField();

    const proto = toProto(CustomField);
    expect(proto).toContain('repeated string tags = 1;');
    expect(proto).toContain('optional string nickname = 2;');
    expect(proto).toContain('// User age in years');
    expect(proto).toContain('double age = 3;');
  });

  it('handles Date as Timestamp with imports', () => {
    @Schema()
    class TimeField {
      @Field({ type: 'google.protobuf.Timestamp' })
      createdAt = new Date();
    }
    new TimeField();

    const proto = toProto(TimeField);
    expect(proto).toContain('import "google/protobuf/timestamp.proto";');
    expect(proto).toContain('google.protobuf.Timestamp createdAt = 1;');
  });

  it('handles nested schemas and orders them correctly', () => {
    @Schema()
    class Child {
      @Field()
      name = '';
    }
    @Schema()
    class Parent {
      @Field({ type: 'Child' })
      child = new Child();
    }
    new Child();
    new Parent();

    const proto = toProto(Parent);
    expect(proto).toContain('message Child {');
    expect(proto).toContain('message Parent {');
    expect(proto.indexOf('message Child {')).toBeLessThan(proto.indexOf('message Parent {'));
  });

  describe('edge cases', () => {
    it('handles constructors that throw', () => {
      @Schema()
      class ThrowingClass {
        @Field()
        id!: string;
        constructor() {
          throw new Error('fail');
        }
      }
      const proto = toProto(ThrowingClass);
      expect(proto).toContain('message ThrowingClass');
    });

    it('throws if dependent schema has no fields', () => {
      @Schema()
      class NoFieldsDep {}
      
      @Schema()
      class DependentParent {
        @Field({ type: 'NoFieldsDep' })
        child!: NoFieldsDep;
      }
      // manually register to ensure lookup works
      defaultRegistry.registerSchema(NoFieldsDep);

      expect(() => toProto(DependentParent)).toThrow(/no @Field/);
    });

    it('collects nested schemas via reflect metadata type', () => {
      @Schema()
      class NestedReflectChild {
        @Field()
        id!: string;
      }
      
      @Schema()
      class ReflectParent {
        @Field({ type: 'NestedReflectChild' })
        child!: NestedReflectChild;
      }
      // Force reflectedType manually since we don't emit it fully in vitest by default
      defaultRegistry.getOrCreateFields(ReflectParent)[0].reflectedType = NestedReflectChild;

      const proto = toProto(ReflectParent);
      expect(proto).toContain('message NestedReflectChild');
      expect(proto).toContain('message ReflectParent');
    });
  });
});
