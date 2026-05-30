/**
 * RocketMQ TypeScript client — schema-aware AMQP wrapper.
 *
 * Composes schema, validation, serialization, and AMQP packages into
 * a single user-facing API. Hides all internal wiring behind `connect()`
 * and `mq.queue()`.
 *
 * Usage:
 *   const mq = await connect();
 *   const orders = mq.queue("orders", Order);
 *   orders.send({ id: "1", customerId: "c1", qty: 5 });
 */

import {
  AmqpConnection,
  type AmqpChannel,
  type ConsumeMessage,
  type AssertQueueOptions,
  type AssertQueueReply,
  type AssertExchangeOptions,
  type AssertExchangeReply,
  type PublishOptions,
  type EmptyReply,
} from '@rocketmq/amqp';
import { defaultRegistry, type SchemaRegistry } from '@rocketmq/schema';
import { toProto } from '@rocketmq/protobuf';
import { JsonSerializer, type Serializer } from '@rocketmq/serializer';
import { validatePayload } from '@rocketmq/validator';
import { QueueHandle } from './queue-handle.js';
import {
  ConnectionError,
  QueueError,
  PublishError,
  ConsumeError,
  ValidationError,
} from './errors.js';

export interface RocketOptions {
  /** AMQP connection URL. Default: amqp://guest:guest@localhost:5672 */
  url?: string;
  /** Custom serializer. Default: JsonSerializer. */
  serializer?: Serializer;
}

/** Opens a connection + channel ready for schema-aware operations. */
export async function connect(opts: RocketOptions = {}): Promise<RocketMQ> {
  const url = opts.url ?? 'amqp://guest:guest@localhost:5672';
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
  constructor(
    private readonly conn: AmqpConnection,
    private readonly ch: AmqpChannel,
    private readonly registry: SchemaRegistry,
    private readonly serializer: Serializer,
  ) {}

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
   */
  async queue<T>(
    name: string,
    schema: new (...args: unknown[]) => T,
    opts?: AssertQueueOptions,
  ): Promise<QueueHandle<T>> {
    await this.assertQueue(name, schema, opts);
    return new QueueHandle<T>(name, this.ch, this.registry, this.serializer);
  }

  /**
   * Declares a queue with an optional schema class.
   *
   * When a schema is provided the proto3 definition is sent as AMQP
   * queue arguments (`x-schema`, `x-schema-type`, `x-schema-message`)
   * so the broker compiles and validates messages inline.
   */
  async assertQueue(
    name: string,
    schema?: Function,
    opts?: AssertQueueOptions,
  ): Promise<AssertQueueReply> {
    if (!schema) {
      return this.ch.assertQueue(name, opts);
    }

    const proto = toProto(schema);
    const fields = this.registry.getFields(schema);
    const subject = this.registry.getSubject(schema);

    this.registry.register(name, {
      ctor: schema,
      name: schema.name,
      subject,
      fields: [...fields],
    });

    try {
      return await this.ch.assertQueue(name, {
        ...opts,
        arguments: {
          ...opts?.arguments,
          'x-schema': proto,
          'x-schema-type': 'protobuf',
          'x-schema-message': schema.name,
        },
      });
    } catch (err) {
      throw new QueueError(`Failed to assert queue '${name}'`, err);
    }
  }

  /** Declares an exchange (passthrough to AMQP layer). */
  async assertExchange(
    name: string,
    type: string,
    opts?: AssertExchangeOptions,
  ): Promise<AssertExchangeReply> {
    return this.ch.assertExchange(name, type, opts);
  }

  /** Binds a queue to an exchange (passthrough to AMQP layer). */
  async bindQueue(queue: string, exchange: string, routingKey: string): Promise<EmptyReply> {
    return this.ch.bindQueue(queue, exchange, routingKey);
  }

  /**
   * Publishes a JSON message directly to a queue (untyped path).
   *
   * Prefer `mq.queue("name", Schema).send()` for type safety.
   * This method exists for backward compatibility with the old API.
   */
  sendToQueue(queue: string, payload: Record<string, unknown>, opts?: PublishOptions): boolean {
    const result = validatePayload(this.registry, queue, payload);
    if (!result.ok) {
      throw new ValidationError(queue, result.issues);
    }

    try {
      const buf = this.serializer.serialize(payload);
      return this.ch.sendToQueue(queue, buf, {
        contentType: this.serializer.contentType,
        persistent: true,
        ...opts,
      });
    } catch (err) {
      throw new PublishError(queue, err);
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
      throw new PublishError(`exchange:${exchange} routingKey:${routingKey}`, err);
    }
  }

  /** Subscribes to a queue with typed JSON parsing (untyped path). */
  async consume<T = Record<string, unknown>>(
    queue: string,
    handler: (msg: T, raw: ConsumeMessage) => void,
    opts?: import('@rocketmq/amqp').ConsumeOptions,
  ): Promise<string> {
    try {
      const reply = await this.ch.consume(
        queue,
        (msg) => {
          if (!msg) return;
          try {
            const body = this.serializer.deserialize(msg.content) as T;
            handler(body, msg);
          } catch (err) {
            console.error(`[rocketmq] deserialization error on queue '${queue}':`, err);
          }
        },
        opts,
      );
      return reply.consumerTag;
    } catch (err) {
      throw new ConsumeError(`Failed to consume from queue '${queue}'`, err);
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
    await this.ch.close();
    await this.conn.close();
  }
}
