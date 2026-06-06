import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueHandle } from './queue-handle.js';
import type { RocketMQ } from './client.js';

class FakeRocketMQ {
  sendToQueue = vi.fn().mockReturnValue(true);
  consume = vi.fn().mockResolvedValue('tag-1');
}

interface TestMsg {
  id: string;
  qty: number;
}

class TestSchema {}

describe('QueueHandle', () => {
  let client: FakeRocketMQ;
  let handle: QueueHandle<TestMsg>;

  beforeEach(() => {
    client = new FakeRocketMQ();
    handle = new QueueHandle<TestMsg>('test-queue', client as unknown as RocketMQ, TestSchema);
  });

  describe('send', () => {
    it('serializes and sends a payload', () => {
      const result = handle.send({ id: '1', qty: 5 });
      expect(result).toBe(true);
      expect(client.sendToQueue).toHaveBeenCalledWith(
        'test-queue',
        { id: '1', qty: 5 },
        undefined,
      );
    });

    it('passes custom publish options', () => {
      handle.send({ id: '1', qty: 5 }, { priority: 5 });
      expect(client.sendToQueue).toHaveBeenCalledWith(
        'test-queue',
        { id: '1', qty: 5 },
        { priority: 5 },
      );
    });
  });

  describe('consume', () => {
    it('subscribes and returns consumer tag', async () => {
      const handler = vi.fn();
      const tag = await handle.consume(handler);
      expect(tag).toBe('tag-1');
      expect(client.consume).toHaveBeenCalledWith(
        'test-queue',
        TestSchema,
        handler,
        undefined,
      );
    });

    it('passes consume options through', async () => {
      const handler = vi.fn();
      await handle.consume(handler, { noAck: true });
      expect(client.consume).toHaveBeenCalledWith(
        'test-queue',
        TestSchema,
        handler,
        { noAck: true },
      );
    });
  });
});
