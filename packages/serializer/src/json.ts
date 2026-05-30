/**
 * JSON serializer — default encoding for RocketMQ SDK.
 *
 * Produces `application/json` payloads that the Rust broker validates
 * by checking all proto schema fields are present in the JSON object.
 *
 * Usage:
 *   const s = new JsonSerializer();
 *   const buf = s.serialize({ id: "1" });
 */

import type { Serializer } from './types.js';

export class JsonSerializer implements Serializer {
  readonly contentType = 'application/json';

  serialize(value: unknown): Buffer {
    return Buffer.from(JSON.stringify(value));
  }

  deserialize(buf: Buffer): unknown {
    return JSON.parse(buf.toString());
  }
}
