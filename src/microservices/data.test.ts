import { describe, expect, it } from 'vitest';
import type { Call, RequestSpec, Scenario, SimResult } from './model';
import { broker, client, db, link, service } from './scenarios/shared';
import { fill, simulate } from './sim';

/** client → api → db, with the shared numbers: links 5 ms, api 10 ms, db 3 ms. */
function apiWithDb(calls: Call[], requests: RequestSpec[], records?: Record<string, string>): Scenario {
  return {
    nodes: [client(), service('api', 1, calls), db('db', 2, [], { ...(records && { records }) })],
    links: [link('client', 'api'), link('api', 'db')],
    requests,
    faults: [],
  };
}

const post = (extra: Partial<RequestSpec> = {}): RequestSpec => ({ label: 'POST /orders', path: '/orders', to: 'api', at: 0, ...extra });

/** The records a db holds at the end of a run, from its write events. */
export function finalRecords(result: SimResult, node: string, start: Record<string, string> = {}): Record<string, string> {
  const records = { ...start };
  for (const e of result.trace) {
    if (e.kind !== 'write' || e.db !== node) continue;
    for (const [key, value] of Object.entries(e.records)) {
      if (value === null) delete records[key];
      else records[key] = value;
    }
  }
  return records;
}

describe('fill', () => {
  it('fills in the request id, key and value', () => {
    expect(fill('order {req} {key}={value}', { id: '#2', key: 'k', value: 'v' })).toBe('order #2 k=v');
  });
});

describe('records and data calls', () => {
  it('writes, reads, deletes and adds records', () => {
    const write = simulate(apiWithDb([{ to: 'db', data: { write: { 'order {req}': '{value}', 'outbox/{req}': 'OrderPlaced' } } }], [post({ value: 'placed' })]));
    expect(write.trace.find((e) => e.kind === 'write')).toMatchObject({ t: 23, db: 'db', request: '#1', records: { 'order #1': 'placed', 'outbox/#1': 'OrderPlaced' } });

    const added = simulate(
      apiWithDb(
        [{ to: 'db', data: { delete: ['outbox/{req}'] } }, { to: 'db', data: { add: { balance: '{value}' } } }, { to: 'db', data: { read: 'balance' } }],
        [post({ value: '-20' })],
        { balance: '100', 'outbox/#1': 'OrderPlaced' },
      ),
    );
    expect(added.requests[0]).toMatchObject({ status: 'ok', value: '80' });
    expect(added.trace.find((e) => e.kind === 'write' && 'outbox/#1' in e.records)).toMatchObject({ records: { 'outbox/#1': null } });
    expect(finalRecords(added, 'db', { balance: '100', 'outbox/#1': 'OrderPlaced' })).toEqual({ balance: '80' });
  });

  it('reads a missing key as no value', () => {
    const result = simulate(apiWithDb([{ to: 'db', data: { read: 'nope' } }], [post()]));
    expect(result.requests[0]!.status).toBe('ok');
    expect(result.requests[0]!.value).toBeUndefined();
    const read = result.trace.find((e) => e.kind === 'read');
    expect(read).toMatchObject({ key: 'nope' });
    expect(read && 'value' in read ? read.value : undefined).toBeUndefined();
  });

  it('applies a multi-record write all or nothing', () => {
    const s = apiWithDb([{ to: 'db', data: { write: { a: '1', b: '2' } } }], [post()]);
    const result = simulate({ ...s, faults: [{ kind: 'down', node: 'db', at: 0 }] });
    expect(result.trace.some((e) => e.kind === 'write')).toBe(false);
    expect(result.requests[0]).toMatchObject({ status: 'failed', reason: 'db is down' });
  });

  it('fills templates from the request a broker delivery carries', () => {
    const s: Scenario = {
      nodes: [
        client(),
        service('orders', 1, [{ to: 'events', label: 'OrderUpdated' }]),
        broker('events', 2, 'queue', ['projector']),
        service('projector', 3, [{ to: 'view-db', data: { write: { '{key}': '{value}' } } }]),
        db('view-db', 4),
      ],
      links: [link('client', 'orders'), link('orders', 'events'), link('events', 'projector'), link('projector', 'view-db')],
      requests: [{ label: 'PUT /orders/42', path: 'PUT /orders/42', to: 'orders', at: 0, key: 'order 42', value: 'paid' }],
      faults: [],
    };
    const result = simulate(s);
    expect(result.trace.filter((e) => e.kind === 'write').at(-1)).toMatchObject({ db: 'view-db', records: { 'order 42': 'paid' } });
  });

  it('passes the last value a service read back to the client', () => {
    const result = simulate(apiWithDb([{ to: 'db', data: { read: 'a' } }, { to: 'db', data: { read: 'b' } }], [post()], { a: '1', b: '2' }));
    expect(result.requests[0]!.value).toBe('2');
  });

  it('keeps a value from a downstream service and ignores answers without one', () => {
    const s: Scenario = {
      nodes: [client(), service('front', 1, ['api', 'other']), service('api', 2, [{ to: 'db', data: { read: 'a' } }]), service('other', 2), db('db', 3, [], { records: { a: '7' } })],
      links: [link('client', 'front'), link('front', 'api'), link('front', 'other'), link('api', 'db')],
      requests: [{ label: 'GET /', path: '/', to: 'front', at: 0 }],
      faults: [],
    };
    expect(simulate(s).requests[0]!.value).toBe('7');
  });

  it('leaves the starting records of the scenario untouched', () => {
    const s = apiWithDb([{ to: 'db', data: { add: { balance: '+5' } } }], [post()], { balance: '1' });
    simulate(s);
    const node = s.nodes.find((n) => n.id === 'db');
    expect(node?.type === 'db' && node.records).toEqual({ balance: '1' });
  });
});
