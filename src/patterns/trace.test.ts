import { describe, expect, it } from 'vitest';
import { MAX_CALLS, show, TRACED, traceRun } from './trace';

class Item {
  label() {
    return 'cup';
  }
}

class Box {
  item?: Item;
  put(item: Item) {
    this.item = item;
    return this.item.label();
  }
}

// oxlint-disable-next-line typescript/no-extraneous-class -- the tracer must handle a static-only class
class Maker {
  static made = 0;
  static make() {
    Maker.made += 1;
    return new Item();
  }
}

class Wrap {
  constructor(readonly inner: Wrap | Item) {}
  read(): string {
    return this.inner instanceof Item ? this.inner.label() : `[${this.inner.read()}]`;
  }
}

class Broken {
  fail(): never {
    throw new Error('boom');
  }
}

class Looper {
  spin(n: number): number {
    return n <= 0 ? 0 : this.spin(n - 1);
  }
}

const originalPut = Box.prototype.put;
const originalMake = Maker.make;

function boxRun() {
  return traceRun({ Box, Item, Maker }, (t) => {
    const box = new Box();
    t.register(box);
    return box.put(Maker.make());
  });
}

describe('traceRun', () => {
  it('records calls, callers, depth and return values', () => {
    const trace = boxRun();
    expect(trace.result).toBe('cup');
    expect(trace.calls.map((c) => [c.caller, c.callee, c.method, c.depth])).toEqual([
      ['client', 'Maker', 'make', 0],
      ['client', 'Box#1', 'put', 0],
      ['Box#1', 'Item#1', 'label', 1],
    ]);
    expect(trace.calls[1]!.args).toBe('Item#1');
    expect(trace.calls[2]!.returned).toBe('"cup"');
    expect(trace.events.map((e) => `${e.kind}${e.call}`)).toEqual(['call0', 'return0', 'call1', 'call2', 'return2', 'return1']);
  });

  it('marks an object first seen as a return value as made by that call', () => {
    const trace = boxRun();
    expect(trace.objects.find((o) => o.id === 'Item#1')!.origin).toEqual({ kind: 'made', by: 0 });
    expect(trace.objects.find((o) => o.id === 'Box#1')!.origin).toEqual({ kind: 'harness' });
  });

  it('reads references from public fields after the run', () => {
    expect(boxRun().references).toEqual([{ from: 'Box#1', field: 'item', to: 'Item#1' }]);
  });

  it('restores methods and static values after a run', () => {
    boxRun();
    expect(Box.prototype.put).toBe(originalPut);
    expect(Maker.make).toBe(originalMake);
    expect(Maker.made).toBe(0);
    expect(TRACED in Box.prototype.put).toBe(false);
  });

  it('gives the same trace twice, with ids starting again at #1', () => {
    expect(boxRun()).toEqual(boxRun());
  });

  it('catches a throw, keeps the calls so far, and restores everything', () => {
    const original = Broken.prototype.fail;
    const trace = traceRun({ Broken }, (t) => {
      const b = new Broken();
      t.register(b);
      b.fail();
    });
    expect(trace.error).toBe('boom');
    expect(trace.calls[0]!.threw).toBe('boom');
    expect(Broken.prototype.fail).toBe(original);
  });

  it('stops a runaway run at MAX_CALLS', () => {
    const original = Looper.prototype.spin;
    const trace = traceRun({ Looper }, () => new Looper().spin(500));
    expect(trace.capped).toBe(true);
    expect(trace.calls).toHaveLength(MAX_CALLS);
    expect(trace.error).toBeUndefined();
    expect(Looper.prototype.spin).toBe(original);
  });

  it('keeps nested objects of one class apart', () => {
    const trace = traceRun({ Wrap, Item }, (t) => {
      const outer = new Wrap(new Wrap(new Item()));
      t.register(outer);
      return outer.read();
    });
    expect(trace.result).toBe('[cup]');
    expect(trace.calls.map((c) => [c.caller, c.callee, c.depth, c.returned])).toEqual([
      ['client', 'Wrap#1', 0, '"[cup]"'],
      ['Wrap#1', 'Wrap#2', 1, '"cup"'],
      ['Wrap#2', 'Item#1', 2, '"cup"'],
    ]);
    expect(trace.objects.find((o) => o.id === 'Wrap#2')!.origin).toEqual({ kind: 'seen' });
  });
});

describe('traceRun with minified classes', () => {
  // A production build renames classes (export class Logger becomes s = class {}), but export names survive.
  const s = class {
    hello() {
      return 'hi';
    }
  };
  const t = class extends s {};

  it('names objects and calls by the export name, not the class\'s own name', () => {
    expect(s.name).not.toBe('Logger');
    const trace = traceRun({ Logger: s, Child: t }, (api) => {
      const child = new t();
      api.register(child);
      return [new s().hello(), child.hello()];
    });
    expect(trace.calls.map((c) => [c.callee, c.className, c.method])).toEqual([
      ['Logger#1', 'Logger', 'hello'],
      ['Child#1', 'Logger', 'hello'],
    ]);
    expect(trace.objects.map((o) => [o.id, o.className])).toEqual([
      ['Child#1', 'Child'],
      ['Logger#1', 'Logger'],
    ]);
  });
});

describe('show', () => {
  const none = () => undefined;
  it('writes short values', () => {
    expect(show('a'.repeat(40), none)).toHaveLength(24);
    expect(show('a'.repeat(40), none).endsWith('…')).toBe(true);
    expect(show([1, 2, 3], none)).toBe('[3 items]');
    expect(show(4, none)).toBe('4');
    expect(show(undefined, none)).toBe('');
    expect(show({ a: 1 }, none)).toBe('{…}');
    expect(show(() => 1, none)).toBe('fn');
  });
});
