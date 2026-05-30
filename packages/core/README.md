# @rocketmq/core

The main RocketMQ client SDK for Node.js. It provides a high-level, schema-aware API for AMQP messaging.

## Features

- **Schema-Aware Queues**: Tie a queue directly to a TypeScript class using decorators.
- **Type-Safe Messaging**: Compile-time type safety for `send()` and `consume()`.
- **Broker-Side Validation**: Integrates directly with RocketMQ's queue-native schema validation.

## Installation

```bash
npm install @rocketmq/core
```

## Quick Start

```typescript
import { connect, Schema, Field } from '@rocketmq/core';

@Schema()
class Order {
  @Field()
  id!: string;

  @Field({ type: 'int32' })
  quantity!: number;
}

async function main() {
  const mq = await connect();
  
  // Creates a typed queue handle and registers the schema with the broker
  const orders = await mq.queue('orders', Order);

  // Type-safe consumption
  await orders.consume((order) => {
    console.log(`Received order: ${order.id} for ${order.quantity} items`);
  });

  // Type-safe publishing
  orders.send({ id: '123', quantity: 5 });
}
```

## License

Apache 2.0
