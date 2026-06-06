/**
 * Dual-mode decorators: works with BOTH experimental decorators
 * (reflect-metadata) AND TC39 stage 3 decorators.
 */

import { inferFromReflectMetadata, inferFromValue } from './inference.js';
import type { FieldOptions } from './metadata.js';
import { defaultRegistry } from './registry.js';
import type { Constructor } from './types.js';

import 'reflect-metadata';

const SCHEMA_SYMBOL = Symbol.for('rocketmq:schema');

/** Checks if a constructor is decorated as a schema class. */
export function isSchemaClass(ctor: unknown): boolean {
  if (typeof ctor !== 'function') return false;
  const R = Reflect as unknown as {
    hasOwnMetadata?: (k: unknown, t: unknown) => boolean;
  };
  return (
    SCHEMA_SYMBOL in ctor ||
    (R.hasOwnMetadata !== undefined && R.hasOwnMetadata(SCHEMA_SYMBOL, ctor))
  );
}

/** Marks a class as a schema definition. */
export function Schema(subject?: string) {
  return function <T extends Constructor>(target: T, _ctxOrUndefined?: ClassDecoratorContext): T {
    Object.defineProperty(target, SCHEMA_SYMBOL, {
      value: true,
      enumerable: false,
      writable: false,
    });
    const R = Reflect as unknown as {
      defineMetadata?: (k: unknown, v: unknown, t: unknown) => void;
    };
    if (R.defineMetadata) {
      R.defineMetadata(SCHEMA_SYMBOL, true, target);
    }
    defaultRegistry.registerSchema(target);
    defaultRegistry.getOrCreateFields(target);
    if (subject) {
      defaultRegistry.setSubject(target, subject);
    }
    return target;
  };
}

/** Marks a property as a schema field. */
export function Field(opts?: FieldOptions) {
  return function (
    targetOrValue: object | undefined,
    keyOrCtx: string | symbol | ClassFieldDecoratorContext,
    // WHY void: Node16 moduleResolution enforces TS1271 — decorator return must be void|any.
    // The TC39 initializer return is consumed by the runtime, not the decorator call site.
  ): void {
    if (targetOrValue === undefined || typeof keyOrCtx === 'object') {
      // WHY cast: TC39 path returns an initializer function at runtime,
      // but the .d.ts must declare void to satisfy experimental decorator constraints.
      return handleTC39Field(opts, keyOrCtx as ClassFieldDecoratorContext) as void;
    }
    handleExperimentalField(opts, targetOrValue, keyOrCtx as string | symbol);
  };
}

/** Experimental decorator path. */
function handleExperimentalField(
  opts: FieldOptions | undefined,
  target: object,
  propertyKey: string | symbol,
): void {
  const ctor = target.constructor as Constructor;
  const name = String(propertyKey);
  const fields = defaultRegistry.getOrCreateFields(ctor);

  if (fields.some((f) => f.name === name)) return;

  const R = Reflect as unknown as {
    getMetadata?: (k: string, t: object, p: string | symbol) => Constructor | undefined;
  };
  const reflectedType = R.getMetadata
    ? R.getMetadata('design:type', target, propertyKey)
    : undefined;
  const protoType = opts?.type ?? inferFromReflectMetadata(target, propertyKey);

  fields.push({
    name,
    protoType,
    number: fields.length + 1,
    reflectedType,
    ...opts,
  });
}

/** TC39 stage 3 decorator path. */
function handleTC39Field(
  opts: FieldOptions | undefined,
  ctx: ClassFieldDecoratorContext,
): ((this: unknown, initialValue: unknown) => unknown) | void {
  const name = String(ctx.name);

  if (opts?.type) {
    ctx.addInitializer(function (this: unknown) {
      registerTC39Field(this, name, opts.type!, opts);
    });
    return;
  }

  return function (this: unknown, initialValue: unknown): unknown {
    registerTC39Field(this, name, inferFromValue(initialValue), opts, initialValue);
    return initialValue;
  };
}

/** Internal TC39 helper to register field inside initializer. */
function registerTC39Field(
  instance: unknown,
  name: string,
  protoType: string,
  opts: FieldOptions | undefined,
  initialValue?: unknown,
): void {
  const ctor = (instance as Record<string, unknown>).constructor as Constructor;
  const fields = defaultRegistry.getOrCreateFields(ctor);
  if (fields.some((f) => f.name === name)) return;

  const reflectedType =
    initialValue && typeof initialValue === 'object'
      ? (Object.getPrototypeOf(initialValue).constructor as Constructor)
      : undefined;

  fields.push({
    name,
    protoType,
    number: fields.length + 1,
    reflectedType,
    ...opts,
  });
}
