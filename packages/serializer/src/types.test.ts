/**
 * Tests for Serializer interface compliance.
 *
 * Verifies that JsonSerializer satisfies the Serializer contract.
 */

import { describe, it, expect } from 'vitest';
import { JsonSerializer } from './json.js';
import type { Serializer } from './types.js';

describe('Serializer interface', () => {
  it('JsonSerializer satisfies the Serializer interface', () => {
    const s: Serializer = new JsonSerializer();
    expect(s.contentType).toBeDefined();
    expect(typeof s.serialize).toBe('function');
    expect(typeof s.deserialize).toBe('function');
  });
});
