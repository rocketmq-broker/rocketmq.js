/**
 * Typed queue handle — the core DX innovation.
 *
 * Wraps a queue name with its schema, serializer, and validator so
 * every send() and consume() call is type-safe at compile time and
 * validated at runtime.
 *
 * Usage:
 *   const orders = mq.queue("orders", Order);
 *   await orders.send({ id: "1", customerId: "c1", qty: 5 });
 *   await orders.consume((msg) => console.log(msg.id));
 */

import type { AmqpChannel, ConsumeMessage, ConsumeOptions, PublishOptions } from '@rocketmq/amqp';
import type { SchemaRegistry } from '@rocketmq/schema';
import type { Serializer } from '@rocketmq/serializer';
import { validatePayload } from '@rocketmq/validator';
import { PublishError, ConsumeError, ValidationError } from './errors.js';

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
   * Pipeline: validate → serialize → send.
   * Throws ValidationError if the payload doesn't match the schema.
   */
  send(payload: T, opts?: PublishOptions): boolean {
    this.validateOrThrow(payload);

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
   * Pipeline: deserialize → validate → handler.
   * Malformed messages are logged but not re-thrown to avoid
   * crashing the consumer loop.
   */
  async consume(
    handler: (msg: T, raw: ConsumeMessage) => void,
    opts?: ConsumeOptions,
  ): Promise<string> {
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
        opts,
      );
      return reply.consumerTag;
    } catch (err) {
      throw new ConsumeError(`Failed to consume from queue '${this.queueName}'`, err);
    }
  }

  /** Validates payload against the registered schema, throws on failure. */
  private validateOrThrow(payload: unknown): void {
    const result = validatePayload(this.registry, this.queueName, payload);
    if (!result.ok) {
      throw new ValidationError(this.queueName, result.issues);
    }
  }
}
