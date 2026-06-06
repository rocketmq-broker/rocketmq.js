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
import { z } from 'zod';
import { connect, RocketMQ } from './client.js';
import { ConnectionError, ConsumeError, PublishError, QueueError } from './errors.js';

// Mock AmqpConnection for connect() tests
vi.mock('@rocketmq/amqp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rocketmq/amqp')>();
  return {
    ...actual,
    AmqpConnection: {
      connect: vi.fn().mockResolvedValue({
        createChannel: vi.fn().mockResolvedValue({
          raw: { on: vi.fn(), removeListener: vi.fn() },
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
  raw = {
    on: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as import('@rocketmq/amqp').AmqpChannel['raw'];
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

  it('handles raw channel errors', () => {
    ch.raw.on.mock.calls[0][1](new Error('broker failure'));
    expect((mq as any).lastChannelError).toBeInstanceOf(Error);
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

    it('supports schemaOverride and schemaDelete options', async () => {
      @Schema()
      class OverOpt {
        @Field()
        id!: string;
      }
      new OverOpt();

      await mq.assertQueue('opt-q', OverOpt, {
        schemaOverride: true,
        schemaDelete: true,
      });

      const args = ch.assertQueue.mock.calls[0][1].arguments;
      expect(args['x-schema-override']).toBe(true);
      expect(args['x-schema-delete']).toBe(true);
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

    it('never sends x-schema-subject as queue arg (triggers Confluent wire validation)', async () => {
      @Schema('notifications.v1')
      class SubjectTest {
        @Field()
        id!: string;
      }
      new SubjectTest();

      await mq.assertQueue('subject-q', SubjectTest);
      const callArgs = ch.assertQueue.mock.calls[0][1];
      expect(callArgs.arguments).not.toHaveProperty('x-schema-subject');
    });

    it('stores subject in client registry even though it is not sent to broker', async () => {
      @Schema('orders.v2')
      class RegistrySubject {
        @Field()
        x!: string;
      }
      new RegistrySubject();

      await mq.assertQueue('reg-q', RegistrySubject);
      const entry = registry.lookup('reg-q');
      expect(entry?.subject).toBe('orders.v2');
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

  describe('consume (typed)', () => {
    // Stub schema class for consume tests — schema arg is required.
    class StubMsg {
      id = '';
    }

    it('subscribes and returns consumer tag', async () => {
      const handler = vi.fn();
      const tag = await mq.consume('q', StubMsg, handler, {
        arguments: { 'x-priority': 10 },
      });
      expect(tag).toBe('tag-1');
      expect(ch.consume).toHaveBeenCalledWith(
        'q',
        expect.any(Function),
        expect.objectContaining({
          arguments: expect.objectContaining({ 'x-priority': 10 }),
        }),
      );
    });

    it('deserializes and calls handler', async () => {
      const handler = vi.fn();
      ch.consume.mockImplementation(async (_q: string, cb: Function) => {
        cb({ content: Buffer.from('{"a":1}'), fields: {}, properties: {} });
        return { consumerTag: 't' };
      });
      await mq.consume('q', StubMsg, handler);
      expect(handler).toHaveBeenCalledWith({ a: 1 }, expect.anything());
    });

    it('ignores null messages', async () => {
      const handler = vi.fn();
      ch.consume.mockImplementation(async (_q: string, cb: Function) => {
        cb(null);
        return { consumerTag: 't' };
      });
      await mq.consume('q', StubMsg, handler);
      expect(handler).not.toHaveBeenCalled();
    });

    it('logs deserialization errors without crashing', async () => {
      const handler = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      ch.consume.mockImplementation(async (_q: string, cb: Function) => {
        cb({ content: Buffer.from('not-json'), fields: {}, properties: {} });
        return { consumerTag: 't' };
      });
      await mq.consume('q', StubMsg, handler);
      expect(handler).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('throws ConsumeError when channel.consume rejects', async () => {
      ch.consume.mockRejectedValue(new Error('NOT_FOUND'));
      await expect(mq.consume('q', StubMsg, vi.fn())).rejects.toThrow(ConsumeError);
    });

    it('returns empty args when queue not in registry and no schema provided', async () => {
      const handler = vi.fn();
      await mq.consume('unregistered-fallback', undefined as never, handler);
      
      const callArgs = ch.consume.mock.calls[0][2];
      expect(callArgs.arguments['x-consumer-schema-message']).toBeUndefined();
    });

    it('falls back to registry when schema is undefined', async () => {
      // Create a queue with no schema but with a registry entry
      @Schema()
      class FallbackMsg {
        @Field() id!: string;
      }
      new FallbackMsg();
      mq.assertQueue('fallback-q', FallbackMsg);

      // Force consume to use the fallback by casting undefined
      const handler = vi.fn();
      await mq.consume('fallback-q', undefined as never, handler);
      
      const callArgs = ch.consume.mock.calls[0][2];
      expect(callArgs.arguments['x-consumer-schema-message']).toBe('FallbackMsg');
    });

    it('returns empty args when fallback registry fails to resolve proto', async () => {
      // A class without fields fails proto resolution
      class EmptyFallbackMsg {}
      registry.register('empty-q', { ctor: EmptyFallbackMsg, name: 'Empty', fields: [] });

      const handler = vi.fn();
      await mq.consume('empty-q', undefined as never, handler);

      const callArgs = ch.consume.mock.calls[0][2];
      expect(callArgs.arguments['x-consumer-schema-message']).toBeUndefined();
    });

    it('returns empty args when resolveConsumerArgs fails', async () => {
      // Explicit schema without fields fails proto resolution
      class EmptyMsg {}
      const handler = vi.fn();
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await mq.consume('err-q', EmptyMsg as never, handler);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed to build consumer schema for EmptyMsg:'),
        expect.any(String)
      );
      consoleSpy.mockRestore();

      const callArgs = ch.consume.mock.calls[0][2];
      expect(callArgs.arguments['x-consumer-schema-message']).toBeUndefined();
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

describe('RocketMQ (Zod schemas)', () => {
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

  describe('assertQueue with ZodSchemaInput', () => {
    it('sends proto3 from Zod schema to broker', async () => {
      const zodInput = {
        name: 'ZodNotification',
        schema: z.object({ id: z.string(), content: z.string() }),
      };

      await mq.assertQueue('zod-q', zodInput);

      expect(ch.assertQueue).toHaveBeenCalledWith(
        'zod-q',
        expect.objectContaining({
          arguments: expect.objectContaining({
            'x-schema': expect.stringContaining('proto3'),
            'x-schema-type': 'protobuf',
            'x-schema-message': 'ZodNotification',
          }),
        }),
      );
    });

    it('generates correct proto field types from Zod', async () => {
      const zodInput = {
        name: 'ZodMixed',
        schema: z.object({
          name: z.string(),
          age: z.number().int(),
          active: z.boolean(),
        }),
      };

      await mq.assertQueue('zod-mixed', zodInput);

      const callArgs = ch.assertQueue.mock.calls[0][1];
      const proto = callArgs.arguments['x-schema'];
      expect(proto).toContain('string name = 1;');
      expect(proto).toContain('int32 age = 2;');
      expect(proto).toContain('bool active = 3;');
    });

    it('does not register in decorator registry for Zod schemas', async () => {
      const zodInput = {
        name: 'ZodOnly',
        schema: z.object({ x: z.string() }),
      };

      await mq.assertQueue('zod-only', zodInput);

      // Zod schemas have no constructor to register
      expect(registry.lookup('zod-only')).toBeUndefined();
    });

    it('throws QueueError when channel rejects Zod schema', async () => {
      const zodInput = {
        name: 'ZodFail',
        schema: z.object({ v: z.string() }),
      };

      ch.assertQueue.mockRejectedValue(new Error('PRECONDITION_FAILED'));
      await expect(mq.assertQueue('fail-zod', zodInput)).rejects.toThrow(QueueError);
    });
  });

  describe('consume with ZodSchemaInput', () => {
    it('sends consumer schema args from Zod', async () => {
      const zodInput = {
        name: 'ZodConsumer',
        schema: z.object({ id: z.string() }),
      };

      const handler = vi.fn();
      await mq.consume('zod-consume', zodInput, handler);

      expect(ch.consume).toHaveBeenCalledWith(
        'zod-consume',
        expect.any(Function),
        expect.objectContaining({
          arguments: expect.objectContaining({
            'x-consumer-schema': expect.stringContaining('proto3'),
            'x-consumer-schema-message': 'ZodConsumer',
          }),
        }),
      );
    });

    it('subscribes and returns consumer tag with Zod schema', async () => {
      const zodInput = {
        name: 'ZodTag',
        schema: z.object({ id: z.string() }),
      };

      const handler = vi.fn();
      const tag = await mq.consume('zod-tag', zodInput, handler);
      expect(tag).toBe('tag-1');
    });
  });

  describe('assertQueue with raw ZodObject', () => {
    it('derives message name from queue name', async () => {
      const schema = z.object({ title: z.string() });

      await mq.assertQueue('my-events', schema);

      const callArgs = ch.assertQueue.mock.calls[0][1];
      expect(callArgs.arguments['x-schema-message']).toBe('MyEvents');
      expect(callArgs.arguments['x-schema']).toContain('message MyEvents {');
    });
  });

  describe('edge cases', () => {
    it('logs error if consumer schema fails to resolve and has no name', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await mq.consume('q2', {} as any, vi.fn());
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('consume with raw ZodObject', () => {
    it('derives consumer message name from queue name', async () => {
      const schema = z.object({ id: z.string() });
      const handler = vi.fn();

      await mq.consume('raw-zod-q', schema, handler);

      expect(ch.consume).toHaveBeenCalledWith(
        'raw-zod-q',
        expect.any(Function),
        expect.objectContaining({
          arguments: expect.objectContaining({
            'x-consumer-schema-message': 'RawZodQ',
          }),
        }),
      );
    });
  });
});

describe('connect()', () => {
  it('returns a RocketMQ instance on success', async () => {
    const mq = await connect({ url: 'amqp://localhost' });
    expect(mq).toBeInstanceOf(RocketMQ);
  });

  it('accepts a custom serializer', async () => {
    const custom = new JsonSerializer();
    const mq = await connect({ url: 'amqp://localhost', serializer: custom });
    expect(mq).toBeInstanceOf(RocketMQ);
  });

  it('throws ConnectionError when connection fails', async () => {
    const { AmqpConnection } = await import('@rocketmq/amqp');
    vi.mocked(AmqpConnection.connect).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(connect({ url: 'amqp://bad-host' })).rejects.toThrow(ConnectionError);
  });
});
