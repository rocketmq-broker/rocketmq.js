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

import type { ConsumeOptions, PublishOptions } from '@rocketmq/amqp';
import type { RocketMQ, TypedConsumeHandler } from './client.js';
import type { SchemaInput } from './schema-resolver.js';

export class QueueHandle<T> {
  constructor(
    private readonly queueName: string,
    private readonly client: RocketMQ,
    private readonly schema: SchemaInput<T>,
  ) {}

  /**
   * Publishes a typed payload to this queue.
   *
   * Pipeline: serialize → send. Validation is broker-side.
   */
  send(payload: T, opts?: PublishOptions): boolean {
    return this.client.sendToQueue(this.queueName, payload as Record<string, unknown>, opts);
  }

  /**
   * Subscribes to this queue with typed message handling.
   *
   * Sends the consumer's proto definition to the broker via AMQP
   * arguments so the broker can verify schema subset compatibility.
   * Malformed messages are logged but not re-thrown to keep the loop alive.
   */
  async consume(handler: TypedConsumeHandler<T>, opts?: ConsumeOptions): Promise<string> {
    return this.client.consume(this.queueName, this.schema, handler, opts);
  }
}
