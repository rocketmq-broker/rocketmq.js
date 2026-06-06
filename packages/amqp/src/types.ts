/**
 * Re-exported amqplib types used across the SDK.
 *
 * Centralizes the amqplib dependency so other packages never
 * import from amqplib directly.
 */

import type amqp from 'amqplib';

export type ConsumeMessage = amqp.ConsumeMessage;
export type PublishOptions = amqp.Options.Publish;
export type ConsumeOptions = amqp.Options.Consume;
export type AssertQueueOptions = amqp.Options.AssertQueue;
export type AssertExchangeOptions = amqp.Options.AssertExchange;
export type AssertQueueReply = amqp.Replies.AssertQueue;
export type AssertExchangeReply = amqp.Replies.AssertExchange;
export type ConsumeReply = amqp.Replies.Consume;
export type EmptyReply = amqp.Replies.Empty;

export type ConsumeHandler = (msg: ConsumeMessage | null) => void;
