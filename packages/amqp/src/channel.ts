/**
 * Thin wrapper around an amqplib Channel.
 *
 * Exposes only the operations the SDK needs without leaking the full
 * amqplib surface. No schema or validation logic lives here.
 *
 * Usage:
 *   const ch = await connection.createChannel();
 *   ch.sendToQueue("orders", buffer, { persistent: true });
 */

import type amqp from 'amqplib';
import type {
  AssertQueueOptions,
  AssertQueueReply,
  AssertExchangeOptions,
  AssertExchangeReply,
  ConsumeMessage,
  ConsumeOptions,
  ConsumeReply,
  EmptyReply,
  PublishOptions,
} from './types.js';

export class AmqpChannel {
  constructor(private readonly ch: amqp.Channel) {}

  /** Exposes the raw amqplib channel for event listeners (e.g. "error"). */
  get raw(): amqp.Channel {
    return this.ch;
  }

  async assertQueue(name: string, opts?: AssertQueueOptions): Promise<AssertQueueReply> {
    return this.ch.assertQueue(name, opts);
  }

  async assertExchange(
    name: string,
    type: string,
    opts?: AssertExchangeOptions,
  ): Promise<AssertExchangeReply> {
    return this.ch.assertExchange(name, type, opts);
  }

  async bindQueue(queue: string, exchange: string, routingKey: string): Promise<EmptyReply> {
    return this.ch.bindQueue(queue, exchange, routingKey);
  }

  sendToQueue(queue: string, content: Buffer, opts?: PublishOptions): boolean {
    return this.ch.sendToQueue(queue, content, opts);
  }

  publish(exchange: string, routingKey: string, content: Buffer, opts?: PublishOptions): boolean {
    return this.ch.publish(exchange, routingKey, content, opts);
  }

  async consume(
    queue: string,
    handler: (msg: ConsumeMessage | null) => void,
    opts?: ConsumeOptions,
  ): Promise<ConsumeReply> {
    return this.ch.consume(queue, handler, opts);
  }

  ack(msg: ConsumeMessage): void {
    this.ch.ack(msg);
  }

  nack(msg: ConsumeMessage, requeue?: boolean): void {
    this.ch.nack(msg, false, requeue);
  }

  async prefetch(count: number): Promise<void> {
    await this.ch.prefetch(count);
  }

  async close(): Promise<void> {
    await this.ch.close();
  }
}
