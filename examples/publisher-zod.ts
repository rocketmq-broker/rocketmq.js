/**
 * Example: Zod-based schema — no decorators, no wrappers.
 *
 * Demonstrates passing a raw Zod object schema directly to
 * assertQueue and consume. The message name is derived from the
 * queue name automatically (zod-notifications → ZodNotifications).
 *
 * Run: pnpm zod
 */

import { connect } from '@rocketmq/core';
import { z } from 'zod';

export const NotificationSchema = z.object({
  id: z.number(),
  content: z.string(),
  timestamp: z.number(),
});

const mq = await connect({ url: 'amqp://localhost' });
const notificationQueue = await mq.queue('pending-notifications', NotificationSchema);

notificationQueue.send({
  id: 1,
  content: 'Hello via Zod schema',
  timestamp: Date.now(),
});

await notificationQueue.consume((msg) => {
  console.log(msg);
});

// Keep the connection open for 2 seconds to let messages arrive before closing.
await new Promise((r) => setTimeout(r, 2000));
void (await mq.close());
