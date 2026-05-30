/**
 * Tests for AmqpConnection.
 *
 * Mocks the amqplib module to avoid real TCP connections.
 * Covers connect, createChannel, and close.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AmqpConnection } from './connection.js';

// Mock amqplib at the module level
vi.mock('amqplib', () => {
  const fakeChannel = {
    assertQueue: vi.fn().mockResolvedValue({ queue: 'q', messageCount: 0, consumerCount: 0 }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const fakeConn = {
    createChannel: vi.fn().mockResolvedValue(fakeChannel),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    default: {
      connect: vi.fn().mockResolvedValue(fakeConn),
    },
  };
});

describe('AmqpConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connects to the given URL', async () => {
    const conn = await AmqpConnection.connect('amqp://localhost');
    expect(conn).toBeInstanceOf(AmqpConnection);
  });

  it('creates an AmqpChannel from the connection', async () => {
    const conn = await AmqpConnection.connect('amqp://localhost');
    const ch = await conn.createChannel();
    // AmqpChannel wraps the fake channel
    expect(ch).toBeDefined();
    expect(typeof ch.assertQueue).toBe('function');
  });

  it('closes the underlying connection', async () => {
    const amqplib = await import('amqplib');
    const conn = await AmqpConnection.connect('amqp://localhost');
    await conn.close();
    // Verify the mock connection's close was called
    const mockConn = await amqplib.default.connect('amqp://localhost');
    expect(mockConn.close).toHaveBeenCalled();
  });
});
