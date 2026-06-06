import { defaultRegistry } from './registry.js';
import type { Constructor } from './types.js';

/** Infers proto type from reflect metadata. */
export function inferFromReflectMetadata(target: object, key: string | symbol): string {
  const R = Reflect as unknown as {
    getMetadata?: (key: string, target: object, prop: string | symbol) => Constructor | undefined;
  };
  if (!R.getMetadata) return 'string';

  const designType = R.getMetadata('design:type', target, key);
  if (!designType) return 'string';

  return inferFromConstructor(designType);
}

/** Infers type from primitive or schema constructors. */
export function inferFromConstructor(ctor: Constructor): string {
  if (ctor === Number) return 'double';
  if (ctor === Boolean) return 'bool';
  if (ctor === Date) return 'google.protobuf.Timestamp';
  if (ctor === Array || ctor === Object) return 'bytes';
  if (defaultRegistry.isSchema(ctor)) return ctor.name;
  return 'string';
}

/** Infers type from runtime value (TC39). */
export function inferFromValue(value: unknown): string {
  if (value instanceof Date) return 'google.protobuf.Timestamp';
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto && proto.constructor && defaultRegistry.isSchema(proto.constructor)) {
      return proto.constructor.name;
    }
    return 'bytes';
  }
  switch (typeof value) {
    case 'number':
      return 'double';
    case 'boolean':
      return 'bool';
    default:
      return 'string';
  }
}
