# @rocketmq/amqp

Low-level AMQP 0-9-1 wrapper for RocketMQ.

This package provides the underlying connection and channel abstractions (`AmqpConnection`, `AmqpChannel`) used by the `@rocketmq/core` SDK. It wraps `amqplib` to provide a robust, Promise-based API tailored for RocketMQ's schema-aware messaging extensions.

## Installation

```bash
npm install @rocketmq/amqp
```

## Usage

You generally do not need to use this package directly unless you are building custom broker integrations. Use `@rocketmq/core` instead.

```typescript
import { AmqpConnection } from '@rocketmq/amqp';

const conn = await AmqpConnection.connect('amqp://localhost');
const ch = await conn.createChannel();

await ch.assertQueue('my-queue');
ch.sendToQueue('my-queue', Buffer.from('hello'), { persistent: true });
```

## License

Apache 2.0
