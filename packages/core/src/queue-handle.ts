/**
 * Typed queue handle — the core DX innovation.
 *
 * Wraps a queue name with its schema and serializer so every send()
 * and consume() call is type-safe at compile time. Runtime validation
 * is delegated to the broker's compiled proto schema.
 *
 * Usage:
 *   const orders = mq.queue("orders", Order);
 *   await orders.send({ id: "1", customerId: "c1", qty: 5 });
 *   await orders.consume((msg) => console.log(msg.id));
 */

import type { AmqpChannel, ConsumeMessage, ConsumeOptions, PublishOptions } from '@rocketmq/amqp';
import type { SchemaRegistry } from '@rocketmq/schema';
import type { Serializer } from '@rocketmq/serializer';
import { toProto } from '@rocketmq/protobuf';
import { PublishError, ConsumeError } from './errors.js';

export class QueueHandle<T> {
  constructor(
    private readonly queueName: string,
    private readonly channel: AmqpChannel,
    private readonly registry: SchemaRegistry,
    private readonly serializer: Serializer,
  ) {}

  /**
   * Publishes a typed payload to this queue.
   *
   * Pipeline: serialize → send. Validation is broker-side.
   */
  send(payload: T, opts?: PublishOptions): boolean {
    try {
      const buf = this.serializer.serialize(payload);
      return this.channel.sendToQueue(this.queueName, buf, {
        contentType: this.serializer.contentType,
        persistent: true,
        ...opts,
      });
    } catch (err) {
      throw new PublishError(this.queueName, err);
    }
  }

  /**
   * Subscribes to this queue with typed message handling.
   *
   * Sends the consumer's proto definition to the broker via AMQP
   * arguments so the broker can verify schema subset compatibility.
   * Malformed messages are logged but not re-thrown to keep the loop alive.
   */
  async consume(
    handler: (msg: T, raw: ConsumeMessage) => void,
    opts?: ConsumeOptions,
  ): Promise<string> {
    const consumerArgs = this.buildConsumerSchemaArgs();

    try {
      const reply = await this.channel.consume(
        this.queueName,
        (raw) => {
          if (!raw) return;
          try {
            const body = this.serializer.deserialize(raw.content) as T;
            handler(body, raw);
          } catch (err) {
            // WHY: log instead of throw to keep the consumer loop alive
            console.error(`[rocketmq] deserialization error on queue '${this.queueName}':`, err);
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
      throw new ConsumeError(`Failed to consume from queue '${this.queueName}'`, err);
    }
  }

  /** Builds AMQP arguments for consumer schema subset checking. */
  private buildConsumerSchemaArgs(): Record<string, string> {
    const meta = this.registry.lookup(this.queueName);
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
}
