/**
 * RocketMQ TypeScript client — schema-aware AMQP wrapper.
 *
 * Composes schema, validation, serialization, and AMQP packages into
 * a single user-facing API. Hides all internal wiring behind `connect()`
 * and `mq.queue()`.
 *
 * Supports two schema input styles:
 *   - Decorator classes: `mq.assertQueue('q', MyClass)`
 *   - Zod schemas:       `mq.assertQueue('q', { name: 'Msg', schema: zodObj })`
 *
 * Usage:
 *   const mq = await connect();
 *   const orders = mq.queue("orders", Order);
 *   orders.send({ id: "1", customerId: "c1", qty: 5 });
 */

import {
  AmqpConnection,
  type AmqpChannel,
  type AssertExchangeOptions,
  type AssertExchangeReply,
  type AssertQueueOptions,
  type AssertQueueReply,
  type ConsumeMessage,
  type ConsumeOptions,
  type EmptyReply,
  type PublishOptions,
} from '@rocketmq/amqp';
import { defaultRegistry, type Constructor, type SchemaRegistry } from '@rocketmq/schema';
import { JsonSerializer, type Serializer } from '@rocketmq/serializer';
import { z } from 'zod';
import { rethrowBrokerOr } from './error-parser.js';
import { ConnectionError, ConsumeError, PublishError, QueueError } from './errors.js';
import { QueueHandle } from './queue-handle.js';
import { isConstructorInput, resolveProto, type SchemaInput } from './schema-resolver.js';

export type TypedConsumeHandler<T> = (msg: T, raw: ConsumeMessage) => void | Promise<void>;

export interface RocketAssertQueueOptions extends AssertQueueOptions {
  /** Force update an existing queue's schema even if it conflicts. */
  schemaOverride?: boolean;
  /** Remove the schema binding from an existing queue. */
  schemaDelete?: boolean;
}

export interface RocketConsumeOptions extends ConsumeOptions {
  /**
   * Explicit schema class for consumer compatibility validation.
   *
   * TypeScript generics are erased at runtime, so `consume<T>` alone
   * cannot send `T`'s proto to the broker. Pass the class here so the
   * broker can verify the consumer's expected fields match the queue's
   * declared schema.
   *
   * Example:
   *   await mq.consume<Order>('orders', handler, { consumerSchema: Order });
   */
  consumerSchema?: Constructor;
}

const NameSchema = z.string().min(1, 'Name cannot be empty').max(255, 'Name too long');

const RocketOptionsSchema = z.object({
  url: z.string().url('AMQP connection URL must be a valid URL (e.g. amqp://localhost)'),
  serializer: z.any().optional(),
});

export interface RocketOptions {
  /** AMQP connection URL. */
  url: string;
  /** Custom serializer. Default: JsonSerializer. */
  serializer?: Serializer;
}

/** Opens a connection + channel ready for schema-aware operations. */
export async function connect(opts: RocketOptions): Promise<RocketMQ> {
  const validated = RocketOptionsSchema.parse(opts);
  const url = validated.url;
  const serializer = opts.serializer ?? new JsonSerializer();

  try {
    const conn = await AmqpConnection.connect(url);
    const ch = await conn.createChannel();
    return new RocketMQ(conn, ch, defaultRegistry, serializer);
  } catch (err) {
    throw new ConnectionError(`Failed to connect to ${url}`, err);
  }
}

export class RocketMQ {
  private lastChannelError: Error | null = null;
  private readonly errorListener = (err: Error): void => {
    this.lastChannelError = err;
  };

  constructor(
    private readonly conn: AmqpConnection,
    private readonly ch: AmqpChannel,
    private readonly registry: SchemaRegistry,
    private readonly serializer: Serializer,
  ) {
    // amqplib emits an 'error' event on the channel when the broker sends a Channel.Close
    // (e.g., due to a 406 PRECONDITION_FAILED for schema mismatches). If this event is
    // unhandled, it will crash the Node process. amqplib also rejects the pending
    // Promise (like consume or assertQueue), which we catch and format into a typed
    // SchemaValidationError. So we can safely swallow the raw event here.
    this.ch.raw.on('error', this.errorListener);
  }

  /** Exposes the raw AmqpChannel for event listeners (e.g. broker errors). */
  get channel(): AmqpChannel {
    return this.ch;
  }

  /**
   * Creates a typed queue handle bound to a schema class.
   *
   * Declares the queue with schema metadata in AMQP arguments so the
   * broker compiles and validates messages. Returns a QueueHandle<T>
   * for type-safe send/consume.
   *
   * Usage:
   *   const orders = await mq.queue('orders', OrderClass);
   *   const orders = await mq.queue('orders', zodSchema);
   */
  async queue<T>(
    name: string,
    schema: SchemaInput<T>,
    opts?: RocketAssertQueueOptions,
  ): Promise<QueueHandle<T>> {
    await this.assertQueue(name, schema, opts);
    return new QueueHandle<T>(name, this, schema);
  }

  /**
   * Declares a queue with an optional schema (decorator class or Zod).
   *
   * When a schema is provided the proto3 definition is sent as AMQP
   * queue arguments (`x-schema`, `x-schema-type`, `x-schema-message`)
   * so the broker compiles and validates messages inline.
   *
   * Usage:
   *   await mq.assertQueue('orders', OrderClass);
   *   await mq.assertQueue('orders', { name: 'Order', schema: zodSchema });
   *   await mq.assertQueue('orders', zodSchema);  // message name derived from queue name
   */
  async assertQueue(
    name: string,
    schema?: SchemaInput,
    opts?: RocketAssertQueueOptions,
  ): Promise<AssertQueueReply> {
    NameSchema.parse(name);

    if (!schema) {
      return this.ch.assertQueue(name, opts);
    }

    const schemaArgs = this.buildSchemaQueueArgs(name, schema, opts);

    try {
      return await this.ch.assertQueue(name, {
        ...opts,
        arguments: { ...opts?.arguments, ...schemaArgs },
      });
    } catch (err) {
      const actualErr = this.lastChannelError ?? err;
      rethrowBrokerOr(actualErr, new QueueError(`Failed to assert queue '${name}'`, actualErr));
    }
  }

  private buildSchemaQueueArgs(
    name: string,
    schema: SchemaInput,
    opts?: RocketAssertQueueOptions,
  ): Record<string, string | boolean> {
    const resolved = resolveProto(schema, name);

    // WHY: only register decorator classes — Zod schemas have no constructor
    if (isConstructorInput(schema)) {
      this.registerConstructorSchema(name, schema);
    }

    const schemaArgs: Record<string, string | boolean> = {
      'x-schema': resolved.proto,
      'x-schema-type': 'protobuf',
      'x-schema-message': resolved.messageName,
    };
    if (opts?.schemaOverride) schemaArgs['x-schema-override'] = true;
    if (opts?.schemaDelete) schemaArgs['x-schema-delete'] = true;

    return schemaArgs;
  }

  /** Stores decorator class metadata in the registry for consumer lookups. */
  private registerConstructorSchema(name: string, schema: Constructor): void {
    this.registry.register(name, {
      ctor: schema,
      name: schema.name,
      subject: defaultRegistry.getSubject(schema),
      fields: [...defaultRegistry.getFields(schema)],
    });
  }

  /** Declares an exchange (passthrough to AMQP layer). */
  async assertExchange(
    name: string,
    type: string,
    opts?: AssertExchangeOptions,
  ): Promise<AssertExchangeReply> {
    NameSchema.parse(name);
    return this.ch.assertExchange(name, type, opts);
  }

  /** Binds a queue to an exchange (passthrough to AMQP layer). */
  async bindQueue(queue: string, exchange: string, routingKey: string): Promise<EmptyReply> {
    NameSchema.parse(queue);
    NameSchema.parse(exchange);
    return this.ch.bindQueue(queue, exchange, routingKey);
  }

  /**
   * Publishes a JSON message directly to a queue (untyped path).
   *
   * Prefer `mq.queue("name", Schema).send()` for type safety.
   * Validation is handled broker-side via the queue's compiled schema.
   */
  sendToQueue(queue: string, payload: Record<string, unknown>, opts?: PublishOptions): boolean {
    NameSchema.parse(queue);
    try {
      const buf = this.serializer.serialize(payload);
      return this.ch.sendToQueue(queue, buf, {
        contentType: this.serializer.contentType,
        persistent: true,
        ...opts,
      });
    } catch (err) {
      throw new PublishError(queue, payload, err);
    }
  }

  /**
   * Publishes a JSON message to an exchange with a routing key.
   */
  publish(
    exchange: string,
    routingKey: string,
    payload: Record<string, unknown>,
    opts?: PublishOptions,
  ): boolean {
    try {
      const buf = this.serializer.serialize(payload);
      return this.ch.publish(exchange, routingKey, buf, {
        contentType: this.serializer.contentType,
        persistent: true,
        ...opts,
      });
    } catch (err) {
      throw new PublishError(`exchange:${exchange} routingKey:${routingKey}`, payload, err);
    }
  }

  /**
   * Subscribes to a queue with JSON deserialization and broker-side
   * consumer schema validation.
   *
   * Accepts either a decorator class or a ZodSchemaInput for the schema
   * parameter. The schema serves two purposes:
   * - **Compile-time**: TypeScript infers `T`, so `msg` is fully typed.
   * - **Runtime**: Its proto definition is sent to the broker as AMQP
   *   arguments so the broker can verify subset compatibility.
   *
   * Usage:
   *   await mq.consume("orders", Order, (msg) => console.log(msg.id));
   *   await mq.consume("orders", { name: "Order", schema: zodSchema }, handler);
   *   await mq.consume("orders", zodSchema, handler);
   */
  async consume<T>(
    queue: string,
    schema: SchemaInput<T>,
    handler: TypedConsumeHandler<T>,
    opts?: RocketConsumeOptions,
  ): Promise<string> {
    NameSchema.parse(queue);
    const consumerArgs = this.buildConsumerSchemaArgs(schema, queue);

    try {
      const reply = await this.ch.consume(queue, this.createConsumeCallback(queue, handler), {
        noAck: true,
        ...opts,
        arguments: { ...opts?.arguments, ...consumerArgs },
      });
      return reply.consumerTag;
    } catch (err) {
      const actualErr = this.lastChannelError ?? err;
      rethrowBrokerOr(
        actualErr,
        new ConsumeError(`Failed to consume from queue '${queue}'`, actualErr),
      );
    }
  }

  private createConsumeCallback<T>(
    queue: string,
    handler: TypedConsumeHandler<T>,
  ): (msg: ConsumeMessage | null) => void {
    return async (msg: ConsumeMessage | null) => {
      if (!msg) return;
      try {
        const body = this.serializer.deserialize(msg.content) as T;
        await handler(body, msg);
      } catch (err) {
        console.error(`[rocketmq] deserialization error on queue '${queue}':`, err);
      }
    };
  }

  private buildConsumerSchemaArgs(
    schema: SchemaInput | undefined,
    queue: string,
  ): Record<string, string> {
    if (schema) {
      return this.resolveConsumerArgs(schema, queue);
    }
    return this.fallbackConsumerArgs(queue);
  }

  /** Resolves consumer schema args from an explicit SchemaInput. */
  private resolveConsumerArgs(schema: SchemaInput, queue: string): Record<string, string> {
    try {
      const resolved = resolveProto(schema, queue);
      return {
        'x-consumer-schema': resolved.proto,
        'x-consumer-schema-message': resolved.messageName,
      };
    } catch (err) {
      const name = isConstructorInput(schema)
        ? (schema as Constructor).name
        : (schema as { name: string }).name;
      console.error(
        `[rocketmq] failed to build consumer schema for ${name}:`,
        (err as Error).message,
      );
      return {};
    }
  }

  /** Falls back to registry lookup when no explicit schema is provided. */
  private fallbackConsumerArgs(queue: string): Record<string, string> {
    const meta = this.registry.lookup(queue);
    if (!meta) return {};

    try {
      const resolved = resolveProto(meta.ctor, queue);
      return {
        'x-consumer-schema': resolved.proto,
        'x-consumer-schema-message': resolved.messageName,
      };
    } catch {
      // WHY: ctor may lack @Field() decorators (e.g. untyped consumers)
      return {};
    }
  }

  /** Acknowledges a message. */
  ack(msg: ConsumeMessage): void {
    this.ch.ack(msg);
  }

  /** Negative-acknowledges a message. */
  nack(msg: ConsumeMessage, requeue?: boolean): void {
    this.ch.nack(msg, requeue);
  }

  /** Sets prefetch count on the channel. */
  async prefetch(count: number): Promise<void> {
    await this.ch.prefetch(count);
  }

  /** Closes channel and connection. */
  async close(): Promise<void> {
    this.ch.raw.removeListener('error', this.errorListener);
    await this.ch.close();
    await this.conn.close();
  }
}
