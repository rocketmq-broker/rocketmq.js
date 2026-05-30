/**
 * Pluggable serialization interface.
 *
 * Decouples the SDK from any specific encoding format so users can
 * swap JSON for Protobuf, Avro, or custom encodings without touching
 * the publish/consume pipeline.
 *
 * Usage:
 *   class MySerializer implements Serializer { ... }
 *   const mq = await connect({ serializer: new MySerializer() });
 */
export interface Serializer {
  /** MIME content type sent in AMQP message properties. */
  readonly contentType: string;

  /** Encodes a value to a Buffer for AMQP transmission. */
  serialize(value: unknown): Buffer;

  /** Decodes a Buffer back into a structured value. */
  deserialize(buf: Buffer): unknown;
}
