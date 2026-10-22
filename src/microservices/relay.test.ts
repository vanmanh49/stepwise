import { describe, expect, it } from 'vitest';
import { finalRecords } from './records.testutil';
import { MAX_TIME, type Call, type Scenario } from './model';
import { broker, client, db, link, relayNode, service } from './scenarios/shared';
import { simulate } from './sim';

/** client → orders → db and → events (queue, consumer email); with an outbox, a relay publishes for orders. */
function shop(calls: Call[], options: { outbox?: boolean; requests?: number; pollMs?: number; faults?: Scenario['faults']; records?: Record<string, string> } = {}): Scenario {
  const { outbox = false, requests = 2, pollMs = 40, faults = [], records } = options;
  return {
    nodes: [
      client(),
      service('orders', 1, calls),
      db('db', 2, [], { ...(records && { records }) }),
      broker('events', 2, 'queue', ['email']),
      service('email', 3),
      ...(outbox ? [relayNode('relay', 2, 'db', 'events', pollMs)] : []),
    ],
    links: [link('client', 'orders'), link('orders', 'db'), link('orders', 'events'), link('events', 'email'), ...(outbox ? [link('relay', 'db'), link('relay', 'events')] : [])],
    requests: Array.from({ length: requests }, (_, i) => ({ label: 'POST /orders', path: '/orders', to: 'orders', at: i * 50 })),
    faults,
  };
}

const saveThenPublish: Call[] = [{ to: 'db', data: { write: { 'order {req}': 'placed' } } }, { to: 'events', label: 'OrderPlaced' }];
const outbox: Call[] = [{ to: 'db', data: { write: { 'order {req}': 'placed', 'outbox/{req}': 'OrderPlaced' } } }];

describe('crash-after', () => {
  it('crashes right after the named call answers and restarts later', () => {
    const result = simulate(shop(saveThenPublish, { requests: 2, faults: [{ kind: 'crash-after', node: 'orders', after: 'db', request: '#1', restartMs: 30 }] }));
    expect(finalRecords(result, 'db')).toMatchObject({ 'order #1': 'placed' });
    expect(result.trace.some((e) => e.kind === 'store' && e.request === '#1')).toBe(false);
    expect(result.requests[0]).toMatchObject({ status: 'failed', reason: 'orders-1 crashed' });
    const crashed = result.trace.find((e) => e.kind === 'fault')!;
    expect(result.trace.find((e) => e.kind === 'recover')).toMatchObject({ node: 'orders-1', t: crashed.t + 30 });
  });

  it('serves the next request after the restart', () => {
    const result = simulate(shop(saveThenPublish, { requests: 2, faults: [{ kind: 'crash-after', node: 'orders', after: 'db', request: '#1', restartMs: 10 }] }));
    expect(result.requests.map((r) => r.status)).toEqual(['failed', 'ok']);
  });
});

describe('outbox relay', () => {
  it('publishes each outbox record once, then deletes it', () => {
    const result = simulate(shop(outbox, { outbox: true }));
    expect(result.deliveries.map((d) => [d.id, d.status])).toEqual([
      ['#1/events', 'ok'],
      ['#2/events', 'ok'],
    ]);
    expect(result.trace.filter((e) => e.kind === 'store')).toHaveLength(2);
    expect(finalRecords(result, 'db')).toEqual({ 'order #1': 'placed', 'order #2': 'placed' });
    expect(result.trace.find((e) => e.kind === 'poll' && e.found.length > 0)).toMatchObject({ relay: 'relay', found: ['#1'] });
  });

  it('never starts a poll while the last one is still running', () => {
    const result = simulate(shop(outbox, { outbox: true, pollMs: 1 }));
    expect(result.trace.filter((e) => e.kind === 'store')).toHaveLength(2);
    const polls = result.trace.filter((e) => e.kind === 'poll');
    const sends = result.trace.filter((e) => e.kind === 'send' && e.message.from === 'relay' && e.message.label === 'poll outbox');
    expect(sends.length).toBe(polls.length);
  });

  it('keeps the run open until the outbox is empty', () => {
    const result = simulate(shop(outbox, { outbox: true, requests: 1 }));
    expect(result.requests[0]!.ms).toBeLessThan(40);
    expect(result.trace.at(-1)!.t).toBeGreaterThan(40);
    expect(result.timedOut).toBe(false);
  });

  it('stops waiting for an outbox whose db is down, and leaves the row there', () => {
    const result = simulate(
      shop([{ to: 'db', data: { write: { 'order {req}': 'placed' } } }], {
        outbox: true,
        requests: 1,
        records: { 'outbox/#1': 'OrderPlaced' },
        faults: [{ kind: 'down', node: 'db', at: 40 }],
      }),
    );
    expect(result.timedOut).toBe(false);
    expect(result.endedAt).toBeLessThan(MAX_TIME);
    expect(result.deliveries).toEqual([]);
    // The client's request is done at 33 ms, before the relay's first poll, and nothing else keeps the run going.
    expect(result.trace.some((e) => e.kind === 'poll')).toBe(false);
    expect(finalRecords(result, 'db', { 'outbox/#1': 'OrderPlaced' })).toHaveProperty(['outbox/#1']);
  });
});
