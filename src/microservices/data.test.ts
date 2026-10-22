import { describe, expect, it } from 'vitest';
import type { Call, RequestSpec, Scenario, SimResult } from './model';
import { broker, client, db, link, service } from './scenarios/shared';
import { finalRecords } from './records.testutil';
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

/** orders runs: save pending (undo: cancelled) · payments /pay (undo: /refund) · inventory /reserve; payments writes by path. */
function saga(extra: { faults?: Scenario['faults']; parallel?: boolean } = {}): Scenario {
  const orders: Call[] = [
    { to: 'orders-db', data: { write: { 'order {req}': 'pending' } }, compensate: { to: 'orders-db', data: { write: { 'order {req}': 'cancelled' } } } },
    { to: 'payments', path: '/pay', compensate: { to: 'payments', path: '/refund' } },
    { to: 'inventory', path: '/reserve' },
  ];
  return {
    nodes: [
      client(),
      service('orders', 1, orders, { parallel: extra.parallel ?? false }),
      db('orders-db', 2),
      service('payments', 2, [
        { to: 'payments-db', when: '/pay', data: { write: { 'charge {req}': 'charged' } } },
        { to: 'payments-db', when: '/refund', data: { write: { 'charge {req}': 'refunded' } } },
      ]),
      db('payments-db', 3),
      service('inventory', 2),
    ],
    links: [link('client', 'orders'), link('orders', 'orders-db'), link('orders', 'payments'), link('orders', 'inventory'), link('payments', 'payments-db')],
    requests: [{ label: 'POST /orders', path: '/orders', to: 'orders', at: 0 }],
    faults: extra.faults ?? [{ kind: 'errors', node: 'inventory', rate: 1, reason: 'out of stock' }],
  };
}

const compensated = (result: SimResult) => result.trace.flatMap((e) => (e.kind === 'compensate' ? [e.target] : []));

describe('saga compensation', () => {
  it('undoes finished steps newest first when a later step fails', () => {
    const result = simulate(saga());
    expect(compensated(result)).toEqual(['payments', 'orders-db']);
    expect(result.requests[0]).toMatchObject({ status: 'failed', reason: 'out of stock' });
    expect(finalRecords(result, 'payments-db')).toEqual({ 'charge #1': 'refunded' });
    expect(finalRecords(result, 'orders-db')).toEqual({ 'order #1': 'cancelled' });
  });

  it('skips the compensation of the step that failed', () => {
    const result = simulate(saga({ faults: [{ kind: 'errors', node: 'payments', rate: 1, reason: 'card declined' }] }));
    expect(compensated(result)).toEqual(['orders-db']);
    expect(finalRecords(result, 'payments-db')).toEqual({});
  });

  it('keeps compensating when a compensation fails', () => {
    const result = simulate(
      saga({
        faults: [
          { kind: 'errors', node: 'inventory', rate: 1, reason: 'out of stock' },
          { kind: 'outage', node: 'payments', from: 82, until: 1000, mode: 'refuse' },
        ],
      }),
    );
    expect(compensated(result)).toEqual(['payments', 'orders-db']);
    expect(finalRecords(result, 'payments-db')).toEqual({ 'charge #1': 'charged' });
    expect(finalRecords(result, 'orders-db')).toEqual({ 'order #1': 'cancelled' });
    expect(result.requests[0]!.reason).toBe('out of stock');
  });

  it('sends a call path that the callee matches with when', () => {
    const result = simulate(saga({ faults: [] }));
    expect(finalRecords(result, 'payments-db')).toEqual({ 'charge #1': 'charged' });
    expect(result.requests[0]!.status).toBe('ok');
  });

  it('ignores compensate in a parallel service', () => {
    const result = simulate(saga({ parallel: true }));
    expect(compensated(result)).toEqual([]);
    expect(result.requests[0]!.status).toBe('failed');
  });
});

describe('errors fault', () => {
  const api = (count: number, faults: Scenario['faults'], versions: string[] = []): Scenario => {
    const node = service('api', 1, [], {});
    if (node.type === 'service') versions.forEach((v, i) => (node.instances[i]!.version = v));
    return {
      nodes: [client(), node],
      links: [link('client', 'api')],
      requests: Array.from({ length: count }, (_, i) => ({ label: 'GET /', path: '/', to: 'api', at: i * 30 })),
      faults,
      seed: 7,
    };
  };
  const statuses = (s: Scenario) => simulate(s).requests.map((r) => r.status);

  it('always fails at rate 1 and never at rate 0', () => {
    const failed = simulate(api(3, [{ kind: 'errors', node: 'api', rate: 1, reason: '500: bug' }]));
    expect(failed.requests.map((r) => [r.status, r.reason])).toEqual([['failed', '500: bug'], ['failed', '500: bug'], ['failed', '500: bug']]);
    expect(failed.trace.find((e) => e.kind === 'fail')).toMatchObject({ at: 'api-1', request: '#1', reason: '500: bug', error: true });
    expect(statuses(api(3, [{ kind: 'errors', node: 'api', rate: 0, reason: '500: bug' }]))).toEqual(['ok', 'ok', 'ok']);
  });

  it('fails some requests at a rate in between, the same way every run', () => {
    const s = api(20, [{ kind: 'errors', node: 'api', rate: 0.5, reason: '500: flaky' }]);
    const first = statuses(s);
    expect(first).toContain('ok');
    expect(first).toContain('failed');
    expect(statuses(s)).toEqual(first);
  });

  it('limits the fault to a request, a start time or a version', () => {
    expect(statuses(api(3, [{ kind: 'errors', node: 'api', rate: 1, reason: 'x', request: '#2' }]))).toEqual(['ok', 'failed', 'ok']);
    expect(statuses(api(3, [{ kind: 'errors', node: 'api', rate: 1, reason: 'x', from: 50 }]))).toEqual(['ok', 'ok', 'failed']);
    expect(statuses(api(2, [{ kind: 'errors', node: 'api', rate: 1, reason: 'x', version: 'v2' }], ['v2']))).toEqual(['failed', 'failed']);
    expect(statuses(api(2, [{ kind: 'errors', node: 'api', rate: 1, reason: 'x', version: 'v2' }], ['v1']))).toEqual(['ok', 'ok']);
    expect(statuses(api(2, [{ kind: 'errors', node: 'api-1', rate: 1, reason: 'x' }]))).toEqual(['failed', 'failed']);
  });
});
