import { z } from 'zod';
import { connect, Field, Schema } from '@rocketmq/core';

@Schema()
class NotificationSchema {
  @Field()
  id: number;

  @Field()
  content: string;

  @Field()
  timestamp: number;
}

export const NotificationSchemaZod = z.object({
  id: z.number(),
  content: z.string(),
  timestamp: z.number(),
});

const mq = await connect({ url: 'amqp://localhost' });
const notificationQueue = await mq.queue('pending-notifications', NotificationSchema);

mq.consume('pending-notifications', NotificationSchemaZod, (msg) => {
  console.log(msg);
});

notificationQueue.send({
  id: 1,
  content: 'Hello via Zod schema',
  timestamp: Date.now(),
} as unknown as NotificationSchema);

await new Promise((r) => setTimeout(r, 2000));

void (await mq.close());
