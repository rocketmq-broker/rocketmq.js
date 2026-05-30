/**
 * Example consumer using the new typed queue API.
 *
 * Demonstrates:
 *   1. Typed consumption with QueueHandle<Notification>
 *   2. Automatic deserialization + validation
 *   3. Manual ack
 *
 * Run: pnpm sub:example (from client-ts root)
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

  await mq.prefetch(1);

  const notifications = await mq.queue('pending-notifications', Notification);

  console.log('[sub] waiting for notifications…');

  await notifications.consume((msg, raw) => {
    console.log('[sub] received:', msg);
    mq.ack(raw);
  });
}

main().catch((err) => {
  console.error('[sub] fatal:', err);
  process.exit(1);
});
