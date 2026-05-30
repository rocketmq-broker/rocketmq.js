/**
 * Tests for RocketMQ client and connect().
 *
 * Mocks AmqpConnection to avoid real AMQP connections.
 * Covers: connect (success/failure), assertQueue (with/without schema),
 * assertExchange, bindQueue, sendToQueue (valid/invalid),
 * publish, consume, ack, nack, prefetch, close.
 */

import { Field, Schema, SchemaRegistry } from '@rocketmq/schema';
import { JsonSerializer } from '@rocketmq/serializer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connect, RocketMQ } from './client.js';
import {
  ConnectionError,
  ConsumeError,
  PublishError,
  QueueError,
  ValidationError,
} from './errors.js';

// Mock AmqpConnection for connect() tests
vi.mock('@rocketmq/amqp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rocketmq/amqp')>();
  return {
    ...actual,
    AmqpConnection: {
      connect: vi.fn().mockResolvedValue({
        createChannel: vi.fn().mockResolvedValue({
          assertQueue: vi.fn().mockResolvedValue({ queue: 'q', messageCount: 0, consumerCount: 0 }),
          close: vi.fn().mockResolvedValue(undefined),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };
});
/** Named fake channel mock. */
class FakeAmqpChannel {
  raw = this;
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

/** Named fake connection mock. */
class FakeAmqpConnection {
  close = vi.fn().mockResolvedValue(undefined);
}

describe('RocketMQ', () => {
  let ch: FakeAmqpChannel;
  let conn: FakeAmqpConnection;
  let registry: SchemaRegistry;
  let mq: RocketMQ;

  beforeEach(() => {
    ch = new FakeAmqpChannel();
    conn = new FakeAmqpConnection();
    registry = new SchemaRegistry();
    mq = new RocketMQ(conn as never, ch as never, registry, new JsonSerializer());
  });

  it('exposes channel via .channel', () => {
    expect(mq.channel).toBe(ch);
  });

  describe('assertQueue', () => {
    it('asserts queue without schema', async () => {
      await mq.assertQueue('plain-q');
      expect(ch.assertQueue).toHaveBeenCalledWith('plain-q', undefined);
    });

    it('asserts queue with schema and registers entry', async () => {
      @Schema()
      class TestItem {
        @Field()
        id!: string;
      }
      new TestItem();

      await mq.assertQueue('items', TestItem);

      expect(ch.assertQueue).toHaveBeenCalledWith(
        'items',
        expect.objectContaining({
          arguments: expect.objectContaining({
            'x-schema': expect.stringContaining('proto3'),
            'x-schema-type': 'protobuf',
            'x-schema-message': 'TestItem',
          }),
        }),
      );

      // Verify registry was populated
      const entry = registry.lookup('items');
      expect(entry).toBeDefined();
      expect(entry?.name).toBe('TestItem');
    });

    it('merges user-provided queue options with schema args', async () => {
      @Schema()
      class MergeTest {
        @Field()
        x!: string;
      }
      new MergeTest();

      await mq.assertQueue('merge-q', MergeTest, {
        durable: true,
        arguments: { 'x-max-length': 1000 },
      });

      expect(ch.assertQueue).toHaveBeenCalledWith(
        'merge-q',
        expect.objectContaining({
          durable: true,
          arguments: expect.objectContaining({
            'x-max-length': 1000,
            'x-schema': expect.any(String),
          }),
        }),
      );
    });

    it('throws QueueError when channel rejects', async () => {
      @Schema()
      class QErr {
        @Field()
        v!: string;
      }
      new QErr();

      ch.assertQueue.mockRejectedValue(new Error('PRECONDITION_FAILED'));
      await expect(mq.assertQueue('fail-q', QErr)).rejects.toThrow(QueueError);
    });

    it('includes x-schema-subject when @Schema provides a subject', async () => {
      @Schema('notifications.v1')
      class SubjectTest {
        @Field()
        id!: string;
      }
      new SubjectTest();

      await mq.assertQueue('subject-q', SubjectTest);
      expect(ch.assertQueue).toHaveBeenCalledWith(
        'subject-q',
        expect.objectContaining({
          arguments: expect.objectContaining({
            'x-schema-subject': 'notifications.v1',
          }),
        }),
      );
    });

    it('omits x-schema-subject when @Schema has no subject', async () => {
      @Schema()
      class NoSubject {
        @Field()
        x!: string;
      }
      new NoSubject();

      await mq.assertQueue('no-subject-q', NoSubject);
      const callArgs = ch.assertQueue.mock.calls[0][1];
      expect(callArgs.arguments).not.toHaveProperty('x-schema-subject');
    });
  });

  describe('queue (typed handle)', () => {
    it('returns a QueueHandle after asserting', async () => {
      @Schema()
      class HandleTest {
        @Field()
        id!: string;
      }
      new HandleTest();

      const handle = await mq.queue('handle-q', HandleTest);
      expect(handle).toBeDefined();
      expect(typeof handle.send).toBe('function');
      expect(typeof handle.consume).toBe('function');
    });
  });

  describe('assertExchange', () => {
    it('delegates to channel', async () => {
      await mq.assertExchange('my-ex', 'direct', { durable: true });
      expect(ch.assertExchange).toHaveBeenCalledWith('my-ex', 'direct', { durable: true });
    });
  });

  describe('bindQueue', () => {
    it('delegates to channel', async () => {
      await mq.bindQueue('q', 'ex', 'key');
      expect(ch.bindQueue).toHaveBeenCalledWith('q', 'ex', 'key');
    });
  });

  describe('sendToQueue (untyped)', () => {
    it('serializes and sends valid payload', () => {
      const result = mq.sendToQueue('plain-q', { key: 'value' });
      expect(result).toBe(true);
      expect(ch.sendToQueue).toHaveBeenCalledWith(
        'plain-q',
        expect.any(Buffer),
        expect.objectContaining({ contentType: 'application/json', persistent: true }),
      );
    });

    it('throws ValidationError for invalid payload against registered schema', () => {
      registry.register('validated-q', {
        ctor: class {},
        name: 'V',
        fields: [{ name: 'required_field', protoType: 'string', number: 1 }],
      });
      expect(() => mq.sendToQueue('validated-q', {})).toThrow(ValidationError);
    });

    it('throws PublishError when channel.sendToQueue throws', () => {
      ch.sendToQueue.mockImplementation(() => {
        throw new Error('closed');
      });
      expect(() => mq.sendToQueue('q', { ok: true })).toThrow(PublishError);
    });
  });

  describe('publish', () => {
    it('serializes and publishes to exchange', () => {
      const result = mq.publish('ex', 'key', { data: 1 });
      expect(result).toBe(true);
      expect(ch.publish).toHaveBeenCalledWith(
        'ex',
        'key',
        expect.any(Buffer),
        expect.objectContaining({ contentType: 'application/json' }),
      );
    });

    it('throws PublishError when channel.publish throws', () => {
      ch.publish.mockImplementation(() => {
        throw new Error('closed');
      });
      expect(() => mq.publish('ex', 'key', {})).toThrow(PublishError);
    });
  });

  describe('consume (untyped)', () => {
    it('subscribes and returns consumer tag', async () => {
      const handler = vi.fn();
      const tag = await mq.consume('q', handler);
      expect(tag).toBe('tag-1');
    });

    it('deserializes and calls handler', async () => {
      const handler = vi.fn();
      ch.consume.mockImplementation(async (_q: string, cb: Function) => {
        cb({ content: Buffer.from('{"a":1}'), fields: {}, properties: {} });
        return { consumerTag: 't' };
      });
      await mq.consume('q', handler);
      expect(handler).toHaveBeenCalledWith({ a: 1 }, expect.anything());
    });

    it('ignores null messages', async () => {
      const handler = vi.fn();
      ch.consume.mockImplementation(async (_q: string, cb: Function) => {
        cb(null);
        return { consumerTag: 't' };
      });
      await mq.consume('q', handler);
      expect(handler).not.toHaveBeenCalled();
    });

    it('logs deserialization errors without crashing', async () => {
      const handler = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      ch.consume.mockImplementation(async (_q: string, cb: Function) => {
        cb({ content: Buffer.from('not-json'), fields: {}, properties: {} });
        return { consumerTag: 't' };
      });
      await mq.consume('q', handler);
      expect(handler).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('throws ConsumeError when channel.consume rejects', async () => {
      ch.consume.mockRejectedValue(new Error('NOT_FOUND'));
      await expect(mq.consume('q', vi.fn())).rejects.toThrow(ConsumeError);
    });

    it('validates incoming messages against registered schema', async () => {
      registry.register('validated-q', {
        ctor: class {},
        name: 'Msg',
        fields: [{ name: 'id', protoType: 'string', number: 1 }],
      });

      const handler = vi.fn();
      ch.consume.mockImplementation(async (_q: string, cb: Function) => {
        cb({ content: Buffer.from('{"id":"ok"}'), fields: {}, properties: {} });
        return { consumerTag: 't' };
      });
      await mq.consume('validated-q', handler);
      expect(handler).toHaveBeenCalledWith({ id: 'ok' }, expect.anything());
    });

    it('skips and logs invalid messages against registered schema', async () => {
      registry.register('validated-q', {
        ctor: class {},
        name: 'Msg',
        fields: [{ name: 'id', protoType: 'string', number: 1 }],
      });

      const handler = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      ch.consume.mockImplementation(async (_q: string, cb: Function) => {
        // id is number instead of string — schema violation
        cb({ content: Buffer.from('{"id":123}'), fields: {}, properties: {} });
        return { consumerTag: 't' };
      });
      await mq.consume('validated-q', handler);
      expect(handler).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('validation error'));
      consoleSpy.mockRestore();
    });
  });

  describe('ack / nack', () => {
    it('delegates ack to channel', () => {
      const msg = { content: Buffer.from('') } as never;
      mq.ack(msg);
      expect(ch.ack).toHaveBeenCalledWith(msg);
    });

    it('delegates nack to channel', () => {
      const msg = { content: Buffer.from('') } as never;
      mq.nack(msg, true);
      expect(ch.nack).toHaveBeenCalledWith(msg, true);
    });
  });

  describe('prefetch', () => {
    it('delegates to channel', async () => {
      await mq.prefetch(10);
      expect(ch.prefetch).toHaveBeenCalledWith(10);
    });
  });

  describe('close', () => {
    it('closes channel and connection', async () => {
      await mq.close();
      expect(ch.close).toHaveBeenCalled();
      expect(conn.close).toHaveBeenCalled();
    });
  });
});

describe('connect()', () => {
  it('returns a RocketMQ instance on success', async () => {
    const mq = await connect({ url: 'amqp://localhost' });
    expect(mq).toBeInstanceOf(RocketMQ);
  });

  it('uses default URL when none provided', async () => {
    const mq = await connect();
    expect(mq).toBeInstanceOf(RocketMQ);
  });

  it('accepts a custom serializer', async () => {
    const custom = new JsonSerializer();
    const mq = await connect({ serializer: custom });
    expect(mq).toBeInstanceOf(RocketMQ);
  });

  it('throws ConnectionError when connection fails', async () => {
    const { AmqpConnection } = await import('@rocketmq/amqp');
    vi.mocked(AmqpConnection.connect).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(connect({ url: 'amqp://bad-host' })).rejects.toThrow(ConnectionError);
  });
});
