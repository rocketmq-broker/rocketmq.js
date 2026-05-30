/**
 * Example: both API styles — QueueHandle vs assertQueue + sendToQueue.
 *
 * Demonstrates that passing a schema to assertQueue gives you the
 * same validation behavior as using mq.queue().
 *
 * Run: pnpm pub:example
 */

import { connect, Field, Schema } from '@rocketmq/core';

@Schema('notifications')
class Notification {
  @Field()
  id!: string;

  @Field()
  content!: string;

  @Field({ type: 'int64' })
  timestamp!: number;
}

async function main(): Promise<void> {
  const mq = await connect();

  // ─── Style 1: QueueHandle (typed, recommended) ───────────────
  const notifications = await mq.queue('typed-notifications', Notification);

  await notifications.consume((msg) => {
    console.log('[style-1] received:', msg);
  });

  notifications.send({
    id: '1',
    content: 'Hello via QueueHandle',
    timestamp: Date.now(),
  });

  // ─── Style 2: assertQueue + sendToQueue (classic) ────────────
  await mq.assertQueue('classic-notifications', Notification);

  await mq.consume('classic-notifications', (msg, raw) => {
    console.log('[style-2] received:', msg);
    mq.ack(raw);
  });

  mq.sendToQueue('classic-notifications', {
    id: '2',
    content: 'Hello via sendToQueue',
    timestamp: Date.now(),
  });

  // Both styles validate: this would throw ValidationError
  // mq.sendToQueue("classic-notifications", { bad: "payload" });

  await new Promise((r) => setTimeout(r, 1000));
  await mq.close();
  console.log('[pub] done');
}

main().catch((err: Error) => {
  console.error(err.stack);
  if (err.cause instanceof Error) {
    console.error('Caused by:');
    console.error(err.cause.stack);
  }
  process.exit(1);
});
