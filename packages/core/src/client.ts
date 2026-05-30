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
  type AssertExchangeOptions,
  type AssertExchangeReply,
  type AssertQueueOptions,
  type AssertQueueReply,
  type ConsumeMessage,
  type EmptyReply,
  type PublishOptions,
} from '@rocketmq/amqp';
import { toProto } from '@rocketmq/protobuf';
import { defaultRegistry, type SchemaRegistry } from '@rocketmq/schema';
import { JsonSerializer, type Serializer } from '@rocketmq/serializer';
import { ConnectionError, ConsumeError, PublishError, QueueError } from './errors.js';
import { QueueHandle } from './queue-handle.js';

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
    // WHY: decorators write to defaultRegistry, not the instance registry
    const fields = defaultRegistry.getFields(schema);
    const subject = defaultRegistry.getSubject(schema);

    this.registry.register(name, {
      ctor: schema,
      name: schema.name,
      subject,
      fields: [...fields],
    });

    // Schema metadata sent as queue arguments so the broker compiles
    // a proto descriptor and validates JSON payloads on publish.
    const schemaArgs: Record<string, string> = {
      'x-schema': proto,
      'x-schema-type': 'protobuf',
      'x-schema-message': schema.name,
    };

    try {
      return await this.ch.assertQueue(name, {
        ...opts,
        arguments: {
          ...opts?.arguments,
          ...schemaArgs,
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
   * Validation is handled broker-side via the queue's compiled schema.
   */
  sendToQueue(queue: string, payload: Record<string, unknown>, opts?: PublishOptions): boolean {
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

  /**
   * Subscribes to a queue with JSON deserialization.
   *
   * When a schema was registered via `assertQueue(name, Schema)`,
   * the consumer's proto definition is sent to the broker for subset
   * checking — the broker rejects consumers expecting fields the
   * queue's schema doesn't define.
   *
   * Usage:
   *   await mq.assertQueue("orders", Order);
   *   await mq.consume("orders", (msg) => console.log(msg));
   */
  async consume<T = Record<string, unknown>>(
    queue: string,
    handler: (msg: T, raw: ConsumeMessage) => void,
    opts?: import('@rocketmq/amqp').ConsumeOptions,
  ): Promise<string> {
    // Build consumer schema arguments for broker-side subset validation.
    const consumerArgs = this.buildConsumerSchemaArgs(queue);

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
        {
          ...opts,
          arguments: {
            ...opts?.arguments,
            ...consumerArgs,
          },
        },
      );
      return reply.consumerTag;
    } catch (err) {
      throw new ConsumeError(`Failed to consume from queue '${queue}'`, err);
    }
  }

  /**
   * Builds AMQP arguments for consumer schema compatibility checking.
   *
   * Returns `x-consumer-schema` + `x-consumer-schema-message` if the
   * queue has a registered schema, otherwise an empty object.
   */
  private buildConsumerSchemaArgs(queue: string): Record<string, string> {
    const meta = this.registry.lookup(queue);
    if (!meta) return {};

    try {
      const proto = toProto(meta.ctor);
      return {
        'x-consumer-schema': proto,
        'x-consumer-schema-message': meta.name,
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
    await this.ch.close();
    await this.conn.close();
  }
}
