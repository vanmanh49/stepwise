import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../data-structures/random.testutil';
import type { Fault, NodeSpec, RequestSpec, Scenario, SimResult } from './model';
import * as shared from './scenarios/shared';
import { EventQueue } from '../utils/eventQueue';
import { simulate } from './sim';

const client: NodeSpec = { id: 'client', label: 'Client', type: 'client', column: 0 };

function service(id: string, column: number, calls: string[] = [], processMs = 5, parallel = false): NodeSpec {
  return { id, label: id, type: 'service', column, instances: [{ id: `${id}-1`, processMs }], calls: calls.map((to) => ({ to })), parallel };
}

const request = (to: string, at = 0, path = '/'): RequestSpec => ({ label: `GET ${path}`, path, to, at });

/** client → a → b → … with 10 ms links and 5 ms instances. */
function chain(depth: number): Scenario {
  const ids = ['a', 'b', 'c', 'd'].slice(0, depth);
  return {
    nodes: [client, ...ids.map((id, i) => service(id, i + 1, ids[i + 1] ? [ids[i + 1]!] : []))],
    links: ['client', ...ids].slice(0, -1).map((from, i) => ({ from, to: ids[i]!, latencyMs: 10 })),
    requests: [request('a')],
    faults: [],
  };
}

/** client → a; a calls b, c and d at once; d-1 takes 200 ms. */
function fanOut(): Scenario {
  return {
    nodes: [client, service('a', 1, ['b', 'c', 'd'], 5, true), service('b', 2), service('c', 2), service('d', 2, [], 200)],
    links: [{ from: 'client', to: 'a', latencyMs: 10 }, ...['b', 'c', 'd'].map((to) => ({ from: 'a', to, latencyMs: 10 }))],
    requests: [request('a')],
    faults: [],
  };
}

const withFaults = (s: Scenario, ...faults: Fault[]): Scenario => ({ ...s, faults });

describe('EventQueue', () => {
  it('orders events by time, then by the order they were scheduled', () => {
    const queue = new EventQueue<string>();
    queue.push(5, 'b');
    queue.push(1, 'a');
    queue.push(5, 'c');
    queue.push(3, 'x');
    expect([queue.pop(), queue.pop(), queue.pop(), queue.pop(), queue.pop()].map((e) => e?.item)).toEqual(['a', 'x', 'b', 'c', undefined]);
    expect(queue.size).toBe(0);
  });
});

describe('simulate', () => {
  it('adds latency and processing along a sequential chain', () => {
    expect(simulate(chain(3)).requests[0]).toMatchObject({ id: '#1', status: 'ok', ms: 75, hops: ['client', 'a-1', 'b-1', 'c-1'] });
  });

  it('waits for the slowest branch of a parallel fan-out', () => {
    expect(simulate(fanOut()).requests[0]).toMatchObject({ status: 'ok', ms: 10 + 5 + (10 + 200 + 10) + 10 });
  });

  it('fails a request sent to a dead instance after the link latency', () => {
    const result = simulate(withFaults(chain(1), { kind: 'kill', instance: 'a-1', at: 0 }));
    expect(result.requests[0]).toMatchObject({ status: 'failed', ms: 20, reason: 'a-1 refused the connection' });
  });

  it('applies a fault before a message arriving at the same millisecond', () => {
    const result = simulate(withFaults(chain(1), { kind: 'kill', instance: 'a-1', at: 10 }));
    expect(result.requests[0]).toMatchObject({ status: 'failed', reason: 'a-1 refused the connection' });
  });

  it('fails what an instance is handling when it is killed', () => {
    const slow = chain(1);
    const s: Scenario = { ...slow, nodes: [client, service('a', 1, [], 50)], faults: [{ kind: 'kill', instance: 'a-1', at: 30 }] };
    expect(simulate(s).requests[0]).toMatchObject({ status: 'failed', ms: 40, reason: 'a-1 stopped' });
  });

  it('crashes the instance that handles a matching path and refuses the rest', () => {
    const s: Scenario = {
      nodes: [client, service('app', 1, [], 10)],
      links: [{ from: 'client', to: 'app', latencyMs: 5 }],
      requests: [request('app', 0, '/reviews'), request('app', 50, '/products')],
      faults: [{ kind: 'crash-on', node: 'app', prefix: '/reviews' }],
    };
    const [first, second] = simulate(s).requests;
    expect(first).toMatchObject({ status: 'failed', reason: 'app-1 crashed' });
    expect(second).toMatchObject({ status: 'failed', reason: 'app-1 refused the connection' });
  });

  it('slows an instance from the fault time on', () => {
    const s: Scenario = { ...chain(1), requests: [request('a', 0), request('a', 30)], faults: [{ kind: 'slow', instance: 'a-1', processMs: 100, from: 20 }] };
    const [first, second] = simulate(s).requests;
    expect(first!.ms).toBe(25);
    expect(second!.ms).toBe(25 + 95);
  });

  it("fails a query on a renamed column, but not the owner's queries", () => {
    const s: Scenario = {
      nodes: [
        client,
        { id: 'orders', label: 'Orders', type: 'service', column: 1, instances: [{ id: 'orders-1', processMs: 5 }], calls: [{ to: 'db', columns: ['users.name'] }], parallel: false },
        { id: 'users', label: 'Users', type: 'service', column: 1, instances: [{ id: 'users-1', processMs: 5 }], calls: [{ to: 'db', columns: ['users.name'] }], parallel: false },
        { id: 'db', label: 'DB', type: 'db', column: 2, processMs: 3, columns: ['users.id', 'users.name'] },
      ],
      links: [
        { from: 'client', to: 'orders', latencyMs: 5 },
        { from: 'client', to: 'users', latencyMs: 5 },
        { from: 'orders', to: 'db', latencyMs: 5 },
        { from: 'users', to: 'db', latencyMs: 5 },
      ],
      requests: [request('orders', 0), request('orders', 150), request('users', 150)],
      faults: [{ kind: 'rename-column', node: 'db', from: 'users.name', to: 'users.full_name', at: 100, owner: 'users' }],
    };
    const result = simulate(deepFreeze(s));
    expect(result.requests.map((r) => r.status)).toEqual(['ok', 'failed', 'ok']);
    expect(result.requests[1]!.reason).toBe('no column users.name');
  });

  it('counts calls between two service nodes', () => {
    const s: Scenario = {
      nodes: [client, service('a', 1, ['b']), service('b', 2, ['db']), { id: 'db', label: 'DB', type: 'db', column: 3, processMs: 3, columns: [] }],
      links: [
        { from: 'client', to: 'a', latencyMs: 5 },
        { from: 'a', to: 'b', latencyMs: 5 },
        { from: 'b', to: 'db', latencyMs: 5 },
      ],
      requests: [request('a')],
      faults: [],
    };
    expect(simulate(s).requests[0]).toMatchObject({ status: 'ok', crossServiceCalls: 1, hops: ['client', 'a-1', 'b-1', 'db'] });
  });

  it('fails a query while its database is down', () => {
    const s: Scenario = {
      nodes: [client, service('a', 1, ['db']), { id: 'db', label: 'DB', type: 'db', column: 2, processMs: 3, columns: [] }],
      links: [
        { from: 'client', to: 'a', latencyMs: 5 },
        { from: 'a', to: 'db', latencyMs: 5 },
      ],
      requests: [request('a', 0), request('a', 100)],
      faults: [{ kind: 'down', node: 'db', at: 50 }],
    };
    expect(simulate(s).requests.map((r) => r.reason)).toEqual([undefined, 'db is down']);
  });

  it('gives every request exactly one done event and stops at MAX_TIME', () => {
    const s: Scenario = { ...chain(2), nodes: [client, service('a', 1, ['b']), service('b', 2, [], 20_000)] };
    const result = simulate(s);
    expect(result.requests[0]).toMatchObject({ status: 'failed', ms: 10_000, reason: 'no reply by 10,000 ms' });
    expect(result.timedOut).toBe(true);
    expect(result.trace.filter((e) => e.kind === 'done')).toHaveLength(1);
  });

  it('gives the same trace for the same scenario', () => {
    expect(simulate(fanOut())).toEqual(simulate(fanOut()));
  });
});

describe('simulate: phase 2 faults and service options', () => {
  const api = (extra: Partial<Extract<NodeSpec, { type: 'service' }>> = {}, processMs = 10): NodeSpec => ({ ...shared.service('api', 1, [], { processMs }), ...extra }) as NodeSpec;
  const scenario = (nodes: NodeSpec[], requests: RequestSpec[], faults: Fault[] = []): Scenario => ({
    nodes: [shared.client(), ...nodes],
    links: [shared.link('client', 'api')],
    requests,
    faults,
  });
  const at = (time: number, path = '/'): RequestSpec => ({ label: `GET ${path}`, path, to: 'api', at: time });

  it('stops work in progress during a refuse outage and recovers at until', () => {
    const result = simulate(scenario([api({}, 30)], [at(0), at(40), at(120)], [{ kind: 'outage', node: 'api', from: 20, until: 100, mode: 'refuse' }]));
    expect(result.requests.map((r) => [r.status, r.reason])).toEqual([
      ['failed', 'api-1 stopped'],
      ['failed', 'api-1 refused the connection'],
      ['ok', undefined],
    ]);
    expect(result.trace.find((e) => e.kind === 'recover')).toMatchObject({ t: 100, node: 'api' });
  });

  it('never answers a request that arrives during a hang', () => {
    const result = simulate(scenario([api()], [at(0), at(60)], [{ kind: 'outage', node: 'api', from: 0, until: 50, mode: 'hang' }]));
    expect(result.requests.map((r) => r.status)).toEqual(['failed', 'ok']);
    expect(result.requests[0]!.reason).toBe('no reply by 10,000 ms');
  });

  it('loses the first reply a node sends for the named request', () => {
    const result = simulate(scenario([api()], [at(0), at(50)], [{ kind: 'lose-reply', node: 'api', request: '#2' }]));
    const lost = result.trace.filter((e) => e.kind === 'lost');
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ t: 70, message: { from: 'api-1', request: '#2' } });
    expect(result.requests.map((r) => r.status)).toEqual(['ok', 'failed']);
  });

  it('replays a finished request and refuses one still in progress when dedupe is on', () => {
    const run = (parallel: boolean) =>
      simulate({
        nodes: [shared.client(), shared.service('s1', 1, ['api', 'api'], { parallel }), shared.service('api', 2, [], { dedupe: true })],
        links: [shared.link('client', 's1'), shared.link('s1', 'api')],
        requests: [{ label: 'GET /', path: '/', to: 's1', at: 0 }],
        faults: [],
      });
    const sequential = run(false);
    const parallel = run(true);
    const statuses = (r: SimResult) => r.trace.flatMap((e) => (e.kind === 'duplicate' ? [e.status] : []));
    expect(statuses(sequential)).toEqual(['replayed']);
    expect(sequential.requests[0]!.status).toBe('ok');
    expect(statuses(parallel)).toEqual(['in progress']);
    expect(parallel.requests[0]).toMatchObject({ status: 'failed', reason: 'already in progress' });
  });

  it('skips calls whose path does not match when', () => {
    const result = simulate({
      nodes: [shared.client(), shared.service('api', 1, [{ to: 'a', when: '/a' }, { to: 'b', when: '/b' }]), shared.service('a', 2), shared.service('b', 2)],
      links: [shared.link('client', 'api'), shared.link('api', 'a'), shared.link('api', 'b')],
      requests: [at(0, '/b/x')],
      faults: [],
    });
    expect(result.requests[0]!.hops).toEqual(['client', 'api-1', 'b-1']);
  });
});
