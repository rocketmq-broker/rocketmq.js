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

### Classic API Style

If you prefer the classic AMQP interface over the `QueueHandle` abstraction, you can use `assertQueue` directly while still benefiting from broker-side schema validation and client-side type inference:

```typescript
async function classicApiExample() {
  const mq = await connect();

  // Asserts the queue and registers the schema with the broker
  await mq.assertQueue('orders', Order);

  // Type-safe publishing
  mq.sendToQueue('orders', { id: '123', quantity: 5 });

  // Type-safe consumption — annotate the handler parameter for
  // compile-time safety, and pass consumerSchema for broker-side
  // validation (TypeScript erases types at runtime).
  await mq.consume('orders', (order: Order) => {
    console.log(`Received order: ${order.id} for ${order.quantity} items`);
  }, { consumerSchema: Order });
}
```

### Schema Lifecycle

The broker enforces schema contracts on every publish. You can evolve or remove schemas at runtime using `schemaOverride` and `schemaDelete`.

```typescript
import { connect, Schema, Field } from '@rocketmq/core';

@Schema()
class OrderV1 {
  @Field()
  id!: string;

  @Field({ type: 'int32' })
  quantity!: number;

  @Field()
  customer!: string;
}

@Schema()
class OrderV2 {
  @Field()
  id!: string;

  @Field({ type: 'int32' })
  quantity!: number;
}

async function schemaLifecycle() {
  const mq = await connect();

  // ── Step 1: Declare with schema ────────────────────────────
  // The broker compiles OrderV1 into a proto descriptor and
  // validates every published message against it.
  await mq.assertQueue('orders', OrderV1);

  mq.sendToQueue('orders', { id: '1', quantity: 5, customer: 'Acme' });
  // ✅ Accepted — payload matches OrderV1

  // ── Step 2: Override with a new schema ─────────────────────
  // OrderV2 drops the "customer" field. Without schemaOverride
  // this would fail with a PRECONDITION_FAILED (406) error.
  await mq.assertQueue('orders', OrderV2, { schemaOverride: true });

  mq.sendToQueue('orders', { id: '2', quantity: 10 });
  // ✅ Accepted — payload matches OrderV2

  // ── Step 3: Delete schema (schemaless mode) ────────────────
  // Removes the schema binding entirely. The queue now accepts
  // any JSON payload without validation.
  await mq.assertQueue('orders', OrderV2, { schemaDelete: true });

  mq.sendToQueue('orders', { anything: 'goes', nested: { ok: true } });
  // ✅ Accepted — no schema to enforce
}
```

> **Note**: `schemaOverride` and `schemaDelete` map to the AMQP queue arguments `x-schema-override` and `x-schema-delete` respectively.

## License

Apache 2.0
