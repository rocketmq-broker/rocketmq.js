/**
 * Manages the AMQP connection lifecycle.
 *
 * Wraps amqplib's connect() and exposes a single createChannel() method.
 * No schema, validation, or serialization logic lives here.
 *
 * Usage:
 *   const conn = await AmqpConnection.connect("amqp://localhost");
 *   const ch = await conn.createChannel();
 */

import amqp from 'amqplib';
import { AmqpChannel } from './channel.js';

export class AmqpConnection {
  private constructor(private readonly conn: amqp.ChannelModel) {}

  /** Opens a new AMQP connection to the given URL. */
  static async connect(url: string): Promise<AmqpConnection> {
    const conn = await amqp.connect(url);
    return new AmqpConnection(conn);
  }

  /** Creates a new channel on this connection. */
  async createChannel(): Promise<AmqpChannel> {
    const ch = await this.conn.createChannel();
    return new AmqpChannel(ch);
  }

  /** Closes the underlying TCP connection. */
  async close(): Promise<void> {
    await this.conn.close();
  }
}
