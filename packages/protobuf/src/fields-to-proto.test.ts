/**
 * Tests for fieldsToProto() — FieldMeta[] → proto3 string generation.
 *
 * This is the shared codegen path used by both decorator and Zod pipelines.
 */

import { describe, expect, it } from 'vitest';
import type { FieldMeta } from '@rocketmq/schema';
import { fieldsToProto } from './fields-to-proto.js';

describe('fieldsToProto', () => {
  it('generates proto3 from a single field', () => {
    const fields: FieldMeta[] = [{ name: 'id', protoType: 'string', number: 1 }];

    const expected = ['syntax = "proto3";', '', 'message Order {', '  string id = 1;', '}'].join(
      '\n',
    );

    expect(fieldsToProto('Order', fields)).toBe(expected);
  });

  it('generates proto3 with multiple fields in order', () => {
    const fields: FieldMeta[] = [
      { name: 'name', protoType: 'string', number: 1 },
      { name: 'age', protoType: 'int32', number: 2 },
      { name: 'active', protoType: 'bool', number: 3 },
    ];

    const proto = fieldsToProto('Person', fields);
    expect(proto).toContain('string name = 1;');
    expect(proto).toContain('int32 age = 2;');
    expect(proto).toContain('bool active = 3;');
  });

  it('emits optional modifier', () => {
    const fields: FieldMeta[] = [
      { name: 'nickname', protoType: 'string', number: 1, optional: true },
    ];

    const proto = fieldsToProto('Profile', fields);
    expect(proto).toContain('optional string nickname = 1;');
  });

  it('emits repeated modifier', () => {
    const fields: FieldMeta[] = [{ name: 'tags', protoType: 'string', number: 1, repeated: true }];

    const proto = fieldsToProto('Item', fields);
    expect(proto).toContain('repeated string tags = 1;');
  });

  it('emits comment above field', () => {
    const fields: FieldMeta[] = [
      { name: 'score', protoType: 'double', number: 1, comment: 'Player score' },
    ];

    const proto = fieldsToProto('Game', fields);
    expect(proto).toContain('// Player score');
    expect(proto).toContain('double score = 1;');
  });

  it('includes Timestamp import when needed', () => {
    const fields: FieldMeta[] = [
      { name: 'createdAt', protoType: 'google.protobuf.Timestamp', number: 1 },
    ];

    const proto = fieldsToProto('Event', fields);
    expect(proto).toContain('import "google/protobuf/timestamp.proto";');
  });

  it('throws for empty fields array', () => {
    expect(() => fieldsToProto('Empty', [])).toThrow("Schema 'Empty' has no fields");
  });
});
