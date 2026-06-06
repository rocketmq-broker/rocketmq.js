# rocketmq.js

High-performance, schema-aware AMQP client for the RocketMQ broker, written in TypeScript.

This SDK natively integrates with the RocketMQ broker's schema validation engine to provide end-to-end type safety from your TypeScript code down to the wire. You can use standard TypeScript decorators or Zod schemas to define your message shapes.

## Installation

```bash
npm install @rocketmq/core
# or pnpm install @rocketmq/core
# or yarn add @rocketmq/core
```

## Quick Start

### 1. Connect

```typescript
import { connect } from '@rocketmq/core';

const mq = await connect({ url: 'amqp://localhost' });
```

### 2. Declare a queue with a schema

Using the built-in Decorator API:

```typescript
import { Schema, Field } from '@rocketmq/core';

@Schema()
class Notification {
  @Field()
  id!: string;

  @Field()
  content!: string;

  @Field({ type: 'double' })
  timestamp!: number;
}

// Declares the queue + registers the schema on the broker
const notifications = await mq.queue('notifications', Notification);
```

Using Zod:

```typescript
import { z } from 'zod';
import { connect } from '@rocketmq/core';

const NotificationSchema = z.object({
  id: z.string(),
  content: z.string(),
  timestamp: z.number()
});

const notifications = await mq.queue('notifications', NotificationSchema);
```

### 3. Publish

```typescript
// Type-safe publishing — payload must match the Notification shape
notifications.send({
  id: '1',
  content: 'Hello from Node.js',
  timestamp: 1717520000.0,
});
```

### 4. Consume

```typescript
// Type-safe consumption — handler receives the typed object
await notifications.consume((msg) => {
  console.log(`Got: ${msg.id} — ${msg.content}`);
});
```

### 5. Close

```typescript
await mq.close();
```

---

## API Reference

### `connect(options)`

Opens a connection and returns a `RocketMQ` client.

```typescript
const mq = await connect({ url: 'amqp://localhost' });
const mq = await connect({ url: 'amqp://localhost', serializer: new MySerializer() });
```

### `RocketMQ`

| Method | Description |
|--------|-------------|
| `await mq.queue(name, Schema)` | Declare queue with schema → returns `QueueHandle` |
| `await mq.assertQueue(name, Schema?)` | Declare queue without returning a handle |
| `mq.sendToQueue(name, object)` | Publish an object directly (untyped) |
| `await mq.assertExchange(name, type)` | Declare an exchange |
| `await mq.bindQueue(queue, exchange, routingKey)` | Bind queue to exchange |
| `mq.publish(exchange, routingKey, object)` | Publish to exchange |
| `await mq.consume(queue, handler, options?)` | Subscribe with handler |
| `await mq.close()` | Close channel + connection |

### `QueueHandle<T>`

Typed wrapper returned by `mq.queue()`. All operations are bound to one queue + schema.

```typescript
const orders = await mq.queue('orders', Order);

// Typed publish
orders.send({ id: '1', customer_id: 'c1', qty: 5 });

// Typed consume
await orders.consume((msg) => console.log(msg.id));
```

---

## Schemas

### Defining a schema

You can define schemas using decorators or Zod.

**Decorators:**
```typescript
import { Schema, Field } from '@rocketmq/core';

@Schema()
class OrderEvent {
  @Field()
  order_id!: string;

  @Field()
  action!: string;

  @Field({ type: 'double' })
  amount!: number;
}
```

**Zod:**
```typescript
import { z } from 'zod';

const OrderEvent = z.object({
  order_id: z.string(),
  action: z.string(),
  amount: z.number()
});
```

### Type mapping

By default, types are mapped to protobuf3 types:

| TypeScript / Zod | Proto3 | Notes |
|--------|--------|-------|
| `string` / `z.string()` | `string` | |
| `number` / `z.number()` | `double` | Default for JS numbers |
| `boolean` / `z.boolean()` | `bool` | |
| `Uint8Array` / `z.instanceof(Uint8Array)` | `bytes` | |

### Overriding proto types

You can customize the underlying proto types for cross-language compatibility (e.g. mapping to `int32` instead of `double`):

**Decorators:**
```typescript
@Schema()
class Metric {
  @Field()
  sensor_id!: string;

  @Field({ type: 'int32' })
  count!: number;
}
```

**Zod:**
```typescript
import { z } from 'zod';
import { zodToProto } from '@rocketmq/core';

// Zod doesn't have metadata decorators, so we map them at the schema level if needed,
// or use custom wrappers (though Zod usually defaults numbers to double).
```

Available proto types: `double`, `float`, `int32`, `int64`, `uint32`, `uint64`,
`sint32`, `sint64`, `fixed32`, `fixed64`, `sfixed32`, `sfixed64`, `bool`, `string`, `bytes`.

### Schema validation

The broker validates every published message against the queue's compiled schema.
If a field is missing or has the wrong type, the broker rejects the message:

```typescript
import { SchemaValidationError } from '@rocketmq/core';

try {
  mq.sendToQueue('orders', { wrong_field: 123 });
} catch (err) {
  if (err instanceof SchemaValidationError) {
    console.log(err.code);    // "SchemaTypeMismatch"
    console.log(err.queue);   // "orders"
    console.log(err.fields);  // [{ name: "id", expected: "string", got: "missing" }]
  }
}
```

### Consumer schema verification

When consuming, the SDK sends the consumer's schema to the broker.
The broker verifies compatibility *before* delivering any message.
You can modify or override schemas at declaration/consume time using `schemaOverride` or `schemaDelete`.

```typescript
// Override the queue's schema with the consumer's schema
await mq.assertQueue('orders', NewOrder, { schemaOverride: true });

// Remove the queue's schema entirely
await mq.assertQueue('orders', undefined, { schemaDelete: true });
```

---

## Exchange Routing

For topic/direct/fanout/headers routing:

```typescript
// Declare exchange + queues
await mq.assertExchange('events', 'direct');
await mq.assertQueue('events.created', OrderEvent);
await mq.assertQueue('events.cancelled', OrderEvent);
await mq.bindQueue('events.created', 'events', 'created');
await mq.bindQueue('events.cancelled', 'events', 'cancelled');

// Publish to specific routing keys
mq.publish('events', 'created', {
  order_id: 'ord-001',
  action: 'created',
  amount: 99.90,
});

// Consume from specific queues
await mq.consume('events.created', (msg) => console.log(`NEW:`, msg), { consumerSchema: OrderEvent });
await mq.consume('events.cancelled', (msg) => console.log(`CANCEL:`, msg), { consumerSchema: OrderEvent });
```

---

## Custom Serializer

Swap JSON for any encoding by providing a custom serializer:

```typescript
import type { Serializer } from '@rocketmq/core';

class MyJsonSerializer implements Serializer {
  get contentType() {
    return 'application/json';
  }

  serialize(value: any): Buffer {
    return Buffer.from(JSON.stringify(value));
  }

  deserialize(data: Buffer): any {
    return JSON.parse(data.toString());
  }
}

const mq = await connect({ url: 'amqp://localhost', serializer: new MyJsonSerializer() });
```

Note: the broker strictly validates payloads. Only JSON or Protobuf encodings are currently supported for schema-enforced queues.

---

## Error Handling

All errors extend `RocketMQError`:

```
RocketMQError
├── ConnectionError      // Connection failures
├── QueueError           // Queue declaration failures
├── PublishError         // Publish failures (.queue, .payload)
├── ConsumeError         // Subscribe failures
├── SerializationError   // Encode/decode failures (.payload)
├── SchemaError          // Schema compilation issues
│   └── SchemaValidationError  // Type mismatch (.code, .queue, .fields)
└── TimeoutError         // Operation timeouts
```

```typescript
import { PublishError, SchemaValidationError } from '@rocketmq/core';

try {
  mq.sendToQueue('orders', payload);
} catch (err) {
  if (err instanceof SchemaValidationError) {
    // Structured: err.code, err.queue, err.fields
    for (const field of err.fields) {
      console.log(`  ${field.name}: expected ${field.expected}, got ${field.got}`);
    }
  } else if (err instanceof PublishError) {
    // Generic: err.queue, err.payload
    console.log(`Failed on ${err.queue}`);
  }
}
```

---

## Development

```bash
pnpm install          # install deps
pnpm build            # build all packages
pnpm lint             # run eslint
pnpm fmt              # run prettier
pnpm test             # run tests
```

## License

MIT
