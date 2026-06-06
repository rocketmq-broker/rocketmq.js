/**
 * Parses structured JSON errors from AMQP Channel.Close reply_text.
 *
 * The broker encodes a `BrokerError` JSON object into the reply_text
 * field. This module detects JSON (starts with `{`), validates the shape,
 * and returns a typed `BrokerErrorPayload`.
 *
 * It also handles proto → TypeScript type name mapping, since the broker
 * returns raw proto names (e.g. "double") and the client translates them
 * to language-specific names (e.g. "number").
 *
 * Usage:
 *   const parsed = parseBrokerError(replyText);
 *   if (parsed) throw SchemaValidationError.fromBrokerError(parsed);
 */

import { BrokerErrorCode } from './error-codes.js';
import { SchemaValidationError } from './errors.js';

/** Structured error payload deserialized from broker JSON. */
export interface BrokerErrorPayload {
  code: BrokerErrorCode;
  queue: string;
  fields: FieldErrorDetail[];
  truncated: boolean;
}

/** Per-field error detail from the broker. */
export interface FieldErrorDetail {
  /** Field name in the schema. */
  name: string;
  /** Proto type name that the queue schema expects (e.g. "double"). */
  expected: string;
  /** Proto type name that was actually received (e.g. "string"). */
  got: string;
}

/**
 * Maps proto3 type names to TypeScript-friendly equivalents.
 *
 * WHY here and not in the broker: the broker is language-agnostic.
 * It returns raw proto kind names. Each client SDK maps them to the
 * target language's type system.
 *
 * Usage:
 *   protoToTsType('double') // => 'number'
 *   protoToTsType('int32')  // => 'number'
 *   protoToTsType('bool')   // => 'boolean'
 */
export function protoToTsType(protoType: string): string {
  const mapping: Record<string, string> = {
    double: 'number',
    float: 'number',
    int32: 'number',
    int64: 'number',
    uint32: 'number',
    uint64: 'number',
    sint32: 'number',
    sint64: 'number',
    fixed32: 'number',
    fixed64: 'number',
    sfixed32: 'number',
    sfixed64: 'number',
    bool: 'boolean',
    string: 'string',
    bytes: 'Uint8Array',
    enum: 'enum',
    message: 'object',
  };
  return mapping[protoType] ?? protoType;
}

/**
 * Attempts to parse a structured broker error from AMQP reply_text.
 *
 * Returns `null` if the reply_text is a plain string (not JSON)
 * or doesn't match the expected `BrokerErrorPayload` shape.
 *
 * Usage:
 *   const payload = parseBrokerError('{"code":"SchemaTypeMismatch",...}');
 */
export function parseBrokerError(replyText: string): BrokerErrorPayload | null {
  if (!replyText.startsWith('{')) {
    return null;
  }

  try {
    const raw: unknown = JSON.parse(replyText);
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }

    const obj = raw as Record<string, unknown>;
    if (typeof obj['code'] !== 'string' || typeof obj['queue'] !== 'string') {
      return null;
    }

    return {
      code: obj['code'] as BrokerErrorCode,
      queue: obj['queue'] as string,
      fields: Array.isArray(obj['fields']) ? (obj['fields'] as FieldErrorDetail[]) : [],
      truncated: obj['truncated'] === true,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts the reply_text from an amqplib channel error message.
 *
 * amqplib formats errors as:
 *   'Channel closed by server: 406 (PRECONDITION-FAILED) with message "..."'
 *
 * We extract the content between the last pair of double quotes.
 *
 * Usage:
 *   extractReplyText(new Error('...with message "{\"code\":...}"'))
 */
export function extractReplyText(err: unknown): string | null {
  if (!(err instanceof Error)) {
    return null;
  }

  const match = err.message.match(/with message "(.+)"$/);
  return match?.[1] ?? null;
}

/**
 * Formats a `BrokerErrorPayload` into a developer-friendly message.
 *
 * Uses TypeScript type names (via `protoToTsType`) so the error
 * reads naturally to TS developers.
 *
 * Usage:
 *   formatBrokerError(payload)
 *   // => "Queue 'orders': field 'id' is number in queue but got string"
 */
export function formatBrokerError(payload: BrokerErrorPayload): string {
  const header = `[${payload.code}] Queue '${payload.queue}'`;

  if (payload.fields.length === 0) {
    return header;
  }

  const details = payload.fields
    .map((f) => `  • ${f.name}: expected ${protoToTsType(f.expected)}, got ${protoToTsType(f.got)}`)
    .join('\n');

  const suffix = payload.truncated ? '\n  (some fields omitted)' : '';

  return `${header}:\n${details}${suffix}`;
}

/**
 * Extracts, parses, and converts an AMQP error into a typed SchemaValidationError.
 * Returns null if the error is not a structured broker schema error.
 */
export function wrapBrokerError(err: unknown): SchemaValidationError | null {
  const replyText = extractReplyText(err);
  if (!replyText) {
    return null;
  }

  const parsed = parseBrokerError(replyText);
  if (!parsed) {
    return null;
  }

  const tsFields = parsed.fields.map((f) => ({
    name: f.name,
    expected: protoToTsType(f.expected),
    got: protoToTsType(f.got),
  }));

  return new SchemaValidationError(parsed.code, parsed.queue, tsFields, formatBrokerError(parsed));
}

/**
 * Throws a typed SchemaValidationError if the error is a broker schema error,
 * otherwise throws the provided fallback error.
 */
export function rethrowBrokerOr(err: unknown, fallback: Error): never {
  const validationErr = wrapBrokerError(err);
  if (validationErr) {
    throw validationErr;
  }
  throw fallback;
}
