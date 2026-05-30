# @rocketmq/protobuf

Protobuf generation utilities for RocketMQ.

This package translates TypeScript schema metadata (gathered via `@rocketmq/schema` decorators) into dynamic Protobuf v3 definitions. These definitions are passed as AMQP headers to the broker, enabling native, broker-side schema validation without requiring a separate schema registry service.

## Installation

```bash
npm install @rocketmq/protobuf
```

## Usage

This is an internal package used by `@rocketmq/core`.

```typescript
import { toProto } from '@rocketmq/protobuf';

// Translates a decorated class into a proto3 definition string
const protoDefinition = toProto(MyDecoratedClass);
```

## License

Apache 2.0
