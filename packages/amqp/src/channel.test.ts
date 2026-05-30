/**
 * Tests for AmqpChannel — thin wrapper over amqplib Channel.
 *
 * Uses a FakeChannel mock class to avoid real AMQP connections.
 * Covers every method: assertQueue, assertExchange, bindQueue,
 * sendToQueue, publish, consume, ack, nack, prefetch, close.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AmqpChannel } from './channel.js';

/** Named fake class per user rules — no inline stubs. */
class FakeChannel {
  assertQueue = vi.fn().mockResolvedValue({ queue: 'q', messageCount: 0, consumerCount: 0 });
  assertExchange = vi.fn().mockResolvedValue({ exchange: 'ex' });
  bindQueue = vi.fn().mockResolvedValue({});
  sendToQueue = vi.fn().mockReturnValue(true);
  publish = vi.fn().mockReturnValue(true);
  consume = vi.fn().mockResolvedValue({ consumerTag: 'tag-1' });
  ack = vi.fn();
  nack = vi.fn();
  prefetch = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

describe('AmqpChannel', () => {
  let fake: FakeChannel;
  let channel: AmqpChannel;

  beforeEach(() => {
    fake = new FakeChannel();
    // Cast to satisfy amqp.Channel type — only the methods we call exist
    channel = new AmqpChannel(fake as never);
  });

  it('exposes raw channel via .raw', () => {
    expect(channel.raw).toBe(fake);
  });

  it('delegates assertQueue', async () => {
    const result = await channel.assertQueue('orders', { durable: true });
    expect(fake.assertQueue).toHaveBeenCalledWith('orders', { durable: true });
    expect(result.queue).toBe('q');
  });

  it('delegates assertExchange', async () => {
    const result = await channel.assertExchange('ex', 'direct', { durable: true });
    expect(fake.assertExchange).toHaveBeenCalledWith('ex', 'direct', { durable: true });
    expect(result.exchange).toBe('ex');
  });

  it('delegates bindQueue', async () => {
    await channel.bindQueue('q', 'ex', 'key');
    expect(fake.bindQueue).toHaveBeenCalledWith('q', 'ex', 'key');
  });

  it('delegates sendToQueue', () => {
    const buf = Buffer.from('test');
    const result = channel.sendToQueue('q', buf, { persistent: true });
    expect(fake.sendToQueue).toHaveBeenCalledWith('q', buf, { persistent: true });
    expect(result).toBe(true);
  });

  it('delegates publish', () => {
    const buf = Buffer.from('test');
    const result = channel.publish('ex', 'key', buf, { persistent: true });
    expect(fake.publish).toHaveBeenCalledWith('ex', 'key', buf, { persistent: true });
    expect(result).toBe(true);
  });

  it('delegates consume', async () => {
    const handler = vi.fn();
    const result = await channel.consume('q', handler, { noAck: false });
    expect(fake.consume).toHaveBeenCalledWith('q', handler, { noAck: false });
    expect(result.consumerTag).toBe('tag-1');
  });

  it('delegates ack', () => {
    const msg = { fields: {}, properties: {}, content: Buffer.from('') } as never;
    channel.ack(msg);
    expect(fake.ack).toHaveBeenCalledWith(msg);
  });

  it('delegates nack with requeue', () => {
    const msg = { fields: {}, properties: {}, content: Buffer.from('') } as never;
    channel.nack(msg, true);
    expect(fake.nack).toHaveBeenCalledWith(msg, false, true);
  });

  it('delegates nack without requeue', () => {
    const msg = { fields: {}, properties: {}, content: Buffer.from('') } as never;
    channel.nack(msg);
    expect(fake.nack).toHaveBeenCalledWith(msg, false, undefined);
  });

  it('delegates prefetch', async () => {
    await channel.prefetch(10);
    expect(fake.prefetch).toHaveBeenCalledWith(10);
  });

  it('delegates close', async () => {
    await channel.close();
    expect(fake.close).toHaveBeenCalled();
  });
});
