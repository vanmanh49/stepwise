/** Most calls one traced run records; past it the run stops, so a runaway design can't hang the page. */
export const MAX_CALLS = 200;

/** Marks every wrapper, so tests can prove none is left behind. */
export const TRACED = Symbol('traced');

export type Origin = { kind: 'harness' } | { kind: 'made'; by: number } | { kind: 'seen' };

export interface TracedObject {
  id: string;
  className: string;
  origin: Origin;
  /** Index into `events` where it first appears. */
  firstEvent: number;
}

export interface TracedCall {
  index: number;
  /** An object id, or 'client' at the top. */
  caller: string;
  /** An object id, or the class name for a static method. */
  callee: string;
  className: string;
  method: string;
  args: string;
  depth: number;
  returned?: string;
  threw?: string;
}

export type TraceEvent = { kind: 'call'; call: number } | { kind: 'return'; call: number };

export interface Trace<R> {
  objects: TracedObject[];
  calls: TracedCall[];
  events: TraceEvent[];
  /** Public object-valued fields (and arrays of them) of traced objects, read after the run. */
  references: { from: string; field: string; to: string }[];
  capped: boolean;
  error?: string;
  result?: R;
}

export interface TraceApi {
  register(obj: object): string;
  idOf(obj: unknown): string | undefined;
}

const MAX_SHOWN = 24;

/** A value as short text for a sequence-diagram row. */
export function show(value: unknown, idOf: (v: unknown) => string | undefined): string {
  const id = idOf(value);
  const text =
    id ??
    (typeof value === 'string'
      ? JSON.stringify(value)
      : value === undefined
        ? ''
        : value === null
          ? 'null'
          : Array.isArray(value)
            ? `[${value.length} ${value.length === 1 ? 'item' : 'items'}]`
            : typeof value === 'function'
              ? 'fn'
              : typeof value === 'object'
                ? '{…}'
                : String(value as number | boolean | bigint));
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN - 1)}…` : text;
}

const CAPPED = Symbol('capped');
type Klass = { prototype: object; name: string };
let running = false;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Runs `drive` with every prototype method, getter and static method of `classes` wrapped to
 * record calls, then puts every property of those classes back as it was, even after a throw.
 */
export function traceRun<R>(classes: readonly unknown[], drive: (t: TraceApi) => R): Trace<R> {
  const trace: Trace<R> = { objects: [], calls: [], events: [], references: [], capped: false };
  if (running) return { ...trace, error: 'A traced run is already going.' };
  const klasses = [...new Set(classes.filter((c): c is Klass => typeof c === 'function' && 'prototype' in c))];
  const prototypes = new Set(klasses.map((k) => k.prototype));
  const ids = new WeakMap<object, string>();
  const instances = new Map<string, object>();
  const counters = new Map<string, number>();
  const stack: string[] = [];

  const traced = (value: unknown): value is object => {
    if (typeof value !== 'object' || value === null) return false;
    for (let p = Object.getPrototypeOf(value) as object | null; p; p = Object.getPrototypeOf(p) as object | null) {
      if (prototypes.has(p)) return true;
    }
    return false;
  };
  const sight = (obj: object, origin: Origin): string => {
    const known = ids.get(obj);
    if (known) return known;
    const className = (obj.constructor as { name?: string } | undefined)?.name ?? 'Object';
    const n = (counters.get(className) ?? 0) + 1;
    counters.set(className, n);
    const id = `${className}#${n}`;
    ids.set(obj, id);
    instances.set(id, obj);
    trace.objects.push({ id, className, origin, firstEvent: trace.events.length });
    return id;
  };
  const idOf = (value: unknown) => (traced(value) ? sight(value, { kind: 'seen' }) : undefined);

  const wrap = (fn: (...args: unknown[]) => unknown, className: string, method: string, isStatic: boolean) => {
    const wrapper = function (this: unknown, ...args: unknown[]) {
      const index = trace.calls.length;
      if (index >= MAX_CALLS) throw CAPPED;
      const callee = isStatic ? className : (idOf(this) ?? className);
      const call: TracedCall = {
        index,
        caller: stack.at(-1) ?? 'client',
        callee,
        className,
        method,
        args: args.map((a) => show(a, idOf)).join(', '),
        depth: stack.length,
      };
      trace.calls.push(call);
      trace.events.push({ kind: 'call', call: index });
      stack.push(callee);
      try {
        const result = fn.apply(this, args);
        if (traced(result)) sight(result, { kind: 'made', by: index });
        if (result !== undefined) call.returned = show(result, idOf);
        trace.events.push({ kind: 'return', call: index });
        return result;
      } catch (e) {
        if (e !== CAPPED) {
          call.threw = message(e);
          trace.events.push({ kind: 'return', call: index });
        }
        throw e;
      } finally {
        stack.pop();
      }
    };
    Object.defineProperty(wrapper, TRACED, { value: true });
    return wrapper;
  };

  const saved = klasses.flatMap((k) =>
    [k, k.prototype].map((target) => ({ target, descriptors: Object.getOwnPropertyDescriptors(target) })),
  );
  const patch = (target: object, className: string, isStatic: boolean) => {
    for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(target))) {
      if (key === 'constructor' || key === 'prototype' || !d.configurable) continue;
      if (typeof d.value === 'function') Object.defineProperty(target, key, { ...d, value: wrap(d.value as never, className, key, isStatic) });
      else if (d.get) Object.defineProperty(target, key, { ...d, get: wrap(d.get as never, className, key, isStatic) });
    }
  };

  running = true;
  try {
    for (const k of klasses) {
      patch(k.prototype, k.name, false);
      patch(k, k.name, true);
    }
    trace.result = drive({ register: (obj) => sight(obj, { kind: 'harness' }), idOf: (obj) => (typeof obj === 'object' && obj ? ids.get(obj) : undefined) });
  } catch (e) {
    if (e === CAPPED) trace.capped = true;
    else trace.error = message(e);
  } finally {
    for (const { target, descriptors } of saved) {
      for (const key of Reflect.ownKeys(target)) {
        if (!(key in descriptors) && Object.getOwnPropertyDescriptor(target, key)?.configurable) Reflect.deleteProperty(target, key);
      }
      for (const [key, d] of Object.entries(descriptors)) if (d.configurable) Object.defineProperty(target, key, d);
    }
    running = false;
  }

  for (const [from, obj] of instances) {
    for (const [field, value] of Object.entries(obj)) {
      for (const item of Array.isArray(value) ? (value as unknown[]) : [value]) {
        const to = typeof item === 'object' && item ? ids.get(item) : undefined;
        if (to) trace.references.push({ from, field, to });
      }
    }
  }
  return trace;
}
