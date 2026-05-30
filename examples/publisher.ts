/**
 * Example publisher using the new typed queue API.
 *
 * Demonstrates:
 *   1. Schema definition with decorators
 *   2. Typed queue handle creation
 *   3. Client-side validation before publish
 *   4. Broker error handling
 *
 * Run: pnpm pub:example (from client-ts root)
 */

import { connect, Field, PublishError, Schema } from '@rocketmq/core';

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

  // Typed queue handle — send() infers Notification shape
  const notifications = await mq.queue('pending-notifications', Notification);

  let brokerError: Error | null = null;
  mq.channel.raw.on('error', (err: Error) => {
    brokerError = err;
  });

  notifications.send({
    id: '1',
    content: 'Hello from notification',
    timestamp: Date.now(),
  });

  // Wait for any async channel error from the broker
  await new Promise((r) => setTimeout(r, 500));

  if (brokerError) {
    throw new PublishError('pending-notifications', brokerError);
  }

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
