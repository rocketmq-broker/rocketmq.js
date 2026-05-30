# @rocketmq/schema

Decorator-based schema definition system for RocketMQ.

Provides the `@Schema()` and `@Field()` decorators used to define queue payload structures. This package automatically collects metadata that the `@rocketmq/core` SDK uses to generate Protobuf schemas for broker-side validation.

## Installation

```bash
npm install @rocketmq/schema
```

## Usage

```typescript
import { Schema, Field } from '@rocketmq/schema';

@Schema()
export class User {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field({ type: 'int32' })
  age!: number;
}
```

This package is re-exported by `@rocketmq/core`, so you can just import from there in most applications.

## License

Apache 2.0
