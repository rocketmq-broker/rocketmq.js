# @rocketmq/serializer

Serialization adapters for RocketMQ payloads.

This package provides the `Serializer` interface and a default `JsonSerializer` implementation used by the SDK to convert TypeScript objects to and from `Buffer` payloads for AMQP transmission.

## Installation

```bash
npm install @rocketmq/serializer
```

## Usage

The `JsonSerializer` is used by default in `@rocketmq/core`. You can implement the `Serializer` interface to create custom formats (e.g., Avro, MessagePack).

```typescript
import { JsonSerializer } from '@rocketmq/serializer';

const serializer = new JsonSerializer();

const buf = serializer.serialize({ hello: 'world' });
const obj = serializer.deserialize(buf);
```

## License

Apache 2.0
