/**
 * Tests for zodToProto() — end-to-end Zod schema → proto3 string.
 *
 * Verifies the full pipeline: zodToFields() → fieldsToProto() produces
 * valid proto3 definitions identical to what the decorator path emits.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodToProto } from './zod-to-proto.js';

describe('zodToProto', () => {
  it('generates proto3 for a simple string schema', () => {
    const schema = z.object({ id: z.string(), content: z.string() });
    const proto = zodToProto('Notification', schema);

    const expected = [
      'syntax = "proto3";',
      '',
      'message Notification {',
      '  string id = 1;',
      '  string content = 2;',
      '}',
    ].join('\n');

    expect(proto).toBe(expected);
  });

  it('generates proto3 with mixed types', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().int(),
      active: z.boolean(),
    });

    const proto = zodToProto('User', schema);
    expect(proto).toContain('string name = 1;');
    expect(proto).toContain('int32 age = 2;');
    expect(proto).toContain('bool active = 3;');
    expect(proto).toContain('message User {');
  });

  it('includes Timestamp import for Date fields', () => {
    const schema = z.object({ createdAt: z.date() });
    const proto = zodToProto('Event', schema);

    expect(proto).toContain('import "google/protobuf/timestamp.proto";');
    expect(proto).toContain('google.protobuf.Timestamp createdAt = 1;');
  });

  it('marks optional fields', () => {
    const schema = z.object({
      id: z.string(),
      nickname: z.string().optional(),
    });

    const proto = zodToProto('Profile', schema);
    expect(proto).toContain('optional string nickname = 2;');
  });

  it('marks repeated (array) fields', () => {
    const schema = z.object({
      tags: z.array(z.string()),
    });

    const proto = zodToProto('Item', schema);
    expect(proto).toContain('repeated string tags = 1;');
  });

  it('produces output matching decorator-style proto', () => {
    // This schema mirrors the Notification decorator class from the examples
    const schema = z.object({
      id: z.number(),
      content: z.string(),
      timestamp: z.number(),
    });

    const proto = zodToProto('Notification', schema);
    expect(proto).toContain('double id = 1;');
    expect(proto).toContain('string content = 2;');
    expect(proto).toContain('double timestamp = 3;');
  });
});
