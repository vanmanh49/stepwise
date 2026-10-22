import { describe, expect, it } from 'vitest';
import type { Fault, Scenario } from './model';
import { client, db, gateway, link, service } from './scenarios/shared';
import { simulate } from './sim';
import { spansOf } from './tracing';

/** client → gateway → orders → payments + inventory (parallel), each → its db. */
function shop(faults: Fault[] = [], extra: Partial<Scenario> = {}): Scenario {
  return {
    nodes: [
      client(),
      gateway([{ prefix: '/orders', to: 'orders' }]),
      service('orders', 2, ['payments', 'inventory'], { parallel: true }),
      service('payments', 3, ['payments-db']),
      service('inventory', 3, ['inventory-db']),
      db('payments-db', 4),
      db('inventory-db', 4),
    ],
    links: [
      link('client', 'gateway'),
      link('gateway', 'orders'),
      link('orders', 'payments'),
      link('orders', 'inventory'),
      link('payments', 'payments-db'),
      link('inventory', 'inventory-db'),
    ],
    requests: [{ label: 'GET /orders', path: '/orders', to: 'gateway', at: 0 }],
    faults,
    ...extra,
  };
}

const all = (s: Scenario, propagate = true) => {
  const r = simulate(s);
  return { r, spans: spansOf(s, r.trace, r.trace.length, { propagate, sampled: new Set(r.requests.map((q) => q.id)) }) };
};

describe('spansOf', () => {
  it('links each span to the span that called it', () => {
    const rows = all(shop()).spans.get('#1')!;
    expect(rows.map((x) => [x.label.split(' ')[0], x.depth])).toEqual([
      ['client', 0],
      ['gateway', 1],
      ['orders', 2],
      ['payments', 3],
      ['inventory', 3],
      ['payments-db', 4],
      ['inventory-db', 4],
    ]);
    expect(new Set(rows.map((x) => x.trace))).toEqual(new Set(['T1']));
    expect(rows.every((x) => x.ms !== undefined)).toBe(true);
    expect(rows[0]!.ms).toBe(simulate(shop()).requests[0]!.ms);
  });

  it('marks the slowest span active and the rest visited', () => {
    const rows = all(shop([{ kind: 'slow', instance: 'payments-1', processMs: 200, from: 0 }])).spans.get('#1')!;
    expect(rows.find((x) => x.role === 'active')!.label).toMatch(/^payments /);
    expect(rows.filter((x) => x.role === 'active')).toHaveLength(1);
  });

  it('starts a new trace for every span without propagation', () => {
    const rows = all(shop(), false).spans.get('#1')!;
    expect(rows.every((x) => x.depth === 0)).toBe(true);
    expect(new Set(rows.map((x) => x.trace)).size).toBe(rows.length);
  });

  it('leaves unsampled requests out', () => {
    const r = simulate(shop());
    expect(spansOf(shop(), r.trace, r.trace.length, { propagate: true, sampled: new Set() }).size).toBe(0);
  });

  it('keeps a span open until its reply', () => {
    const s = shop();
    const r = simulate(s);
    const reply = r.trace.findIndex((e) => e.kind === 'send' && e.message.kind === 'reply' && e.message.from === 'payments-1');
    const rows = spansOf(s, r.trace, reply, { propagate: true, sampled: new Set(['#1']) }).get('#1')!;
    expect(rows.find((x) => x.label.startsWith('payments '))!.ms).toBeUndefined();
    expect(rows.find((x) => x.label.startsWith('payments-db'))!.ms).toBeDefined();
  });

  it('gives each retry attempt its own span', () => {
    const s = shop([{ kind: 'outage', node: 'orders', from: 0, until: 20, mode: 'hang' }], {
      nodes: [client(), service('orders', 1, [])],
      links: [link('client', 'orders')],
      requests: [{ label: 'GET /orders', path: '/orders', to: 'orders', at: 0 }],
      clientPolicy: { timeoutMs: 15, retry: { attempts: 1, backoff: 'fixed', baseMs: 10, jitter: false } },
    });
    const tries = all(s).spans.get('#1')!.filter((x) => x.label.startsWith('orders '));
    expect(tries).toHaveLength(2);
    expect(tries[0]!.ms).toBeUndefined();
    expect(tries[1]!.ms).toBe(10);
  });

  it('never closes the span of a request that hangs', () => {
    const rows = all(shop([{ kind: 'outage', node: 'payments', from: 0, until: 20_000, mode: 'hang' }])).spans.get('#1')!;
    expect(rows.find((x) => x.label.startsWith('payments '))!.ms).toBeUndefined();
    expect(rows.find((x) => x.label.startsWith('payments '))!.role).not.toBe('active');
  });
});
