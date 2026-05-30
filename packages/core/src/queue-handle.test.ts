/**
 * Tests for QueueHandle<T>.
 *
 * Uses FakeAmqpChannel and FakeSerializer mocks.
 * Covers: send (valid, invalid, serialization error),
 * consume (success, deserialization error, consume failure).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueHandle } from './queue-handle.js';
import { SchemaRegistry } from '@rocketmq/schema';
import type { SchemaEntry } from '@rocketmq/schema';
import type { Serializer } from '@rocketmq/serializer';
import { PublishError, ConsumeError } from './errors.js';

/** Named fake per user rules. */
class FakeAmqpChannel {
  sendToQueue = vi.fn().mockReturnValue(true);
  consume = vi.fn().mockResolvedValue({ consumerTag: 'tag-1' });
}

/** Named fake serializer. */
class FakeSerializer implements Serializer {
  readonly contentType = 'application/json';
  serialize = vi.fn((v: unknown) => Buffer.from(JSON.stringify(v)));
  deserialize = vi.fn((buf: Buffer) => JSON.parse(buf.toString()));
}

interface TestMsg {
  id: string;
  qty: number;
}

describe('QueueHandle', () => {
  let registry: SchemaRegistry;
  let channel: FakeAmqpChannel;
  let serializer: FakeSerializer;
  let handle: QueueHandle<TestMsg>;

  beforeEach(() => {
    registry = new SchemaRegistry();
    channel = new FakeAmqpChannel();
    serializer = new FakeSerializer();

    const entry: SchemaEntry = {
      ctor: class {},
      name: 'TestMsg',
      fields: [
        { name: 'id', protoType: 'string', number: 1 },
        { name: 'qty', protoType: 'int32', number: 2 },
      ],
    };
    registry.register('test-queue', entry);

    handle = new QueueHandle<TestMsg>('test-queue', channel as never, registry, serializer);
  });

  describe('send', () => {
    it('serializes and sends a payload', () => {
      const result = handle.send({ id: '1', qty: 5 });
      expect(result).toBe(true);
      expect(serializer.serialize).toHaveBeenCalledWith({ id: '1', qty: 5 });
      expect(channel.sendToQueue).toHaveBeenCalledWith(
        'test-queue',
        expect.any(Buffer),
        expect.objectContaining({
          contentType: 'application/json',
          persistent: true,
        }),
      );
    });

    it('passes custom publish options', () => {
      handle.send({ id: '1', qty: 5 }, { priority: 5 });
      expect(channel.sendToQueue).toHaveBeenCalledWith(
        'test-queue',
        expect.any(Buffer),
        expect.objectContaining({ priority: 5 }),
      );
    });

    it('throws PublishError when channel.sendToQueue throws', () => {
      channel.sendToQueue.mockImplementation(() => {
        throw new Error('channel closed');
      });
      expect(() => handle.send({ id: '1', qty: 5 })).toThrow(PublishError);
    });
  });

  describe('consume', () => {
    it('subscribes and returns consumer tag', async () => {
      const handler = vi.fn();
      const tag = await handle.consume(handler);
      expect(tag).toBe('tag-1');
      expect(channel.consume).toHaveBeenCalledWith('test-queue', expect.any(Function), {
        arguments: {},
      });
    });

    it('deserializes and calls handler with typed message', async () => {
      const handler = vi.fn();
      // Capture the internal callback
      channel.consume.mockImplementation(async (_q: string, cb: Function) => {
        const raw = {
          content: Buffer.from(JSON.stringify({ id: 'x', qty: 3 })),
          fields: {},
          properties: {},
        };
        cb(raw);
        return { consumerTag: 'tag-2' };
      });

      await handle.consume(handler);
      expect(handler).toHaveBeenCalledWith(
        { id: 'x', qty: 3 },
        expect.objectContaining({ content: expect.any(Buffer) }),
      );
    });

    it('ignores null messages', async () => {
      const handler = vi.fn();
      channel.consume.mockImplementation(async (_q: string, cb: Function) => {
        cb(null);
        return { consumerTag: 'tag-3' };
      });

      await handle.consume(handler);
      expect(handler).not.toHaveBeenCalled();
    });

    it('logs deserialization errors without crashing', async () => {
      const handler = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      serializer.deserialize.mockImplementation(() => {
        throw new SyntaxError('bad json');
      });

      channel.consume.mockImplementation(async (_q: string, cb: Function) => {
        cb({ content: Buffer.from('not json'), fields: {}, properties: {} });
        return { consumerTag: 'tag-4' };
      });

      await handle.consume(handler);
      expect(handler).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('deserialization error'),
        expect.any(SyntaxError),
      );
      consoleSpy.mockRestore();
    });

    it('throws ConsumeError when channel.consume rejects', async () => {
      channel.consume.mockRejectedValue(new Error('NOT_FOUND'));
      const handler = vi.fn();
      await expect(handle.consume(handler)).rejects.toThrow(ConsumeError);
    });

    it('passes consume options through', async () => {
      const handler = vi.fn();
      await handle.consume(handler, { noAck: true });
      expect(channel.consume).toHaveBeenCalledWith('test-queue', expect.any(Function), {
        noAck: true,
        arguments: {},
      });
    });
  });
});

describe('QueueHandle without schema', () => {
  it('sends without errors when no schema registered', () => {
    const registry = new SchemaRegistry();
    const channel = new FakeAmqpChannel();
    const serializer = new FakeSerializer();
    const handle = new QueueHandle<Record<string, unknown>>(
      'unregistered',
      channel as never,
      registry,
      serializer,
    );

    const result = handle.send({ anything: 'goes' });
    expect(result).toBe(true);
  });
});
