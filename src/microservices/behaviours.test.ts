import { describe, expect, it } from 'vitest';
import { createLimiter, pickInstance, pickVersion } from './behaviours';
import * as shared from './scenarios/shared';
import type { NodeSpec, Scenario, Strategy } from './model';
import { seeded, simulate } from './sim';

const client: Extract<NodeSpec, { type: 'client' }> = { id: 'client', label: 'Client', type: 'client', column: 0 };

function service(id: string, count: number, processMs = 10): NodeSpec {
  return {
    id,
    label: id,
    type: 'service',
    column: 2,
    instances: Array.from({ length: count }, (_, i) => ({ id: `${id}-${i + 1}`, processMs })),
    calls: [],
    parallel: false,
  };
}

function gatewayScenario(path: string, token: boolean): Scenario {
  return {
    nodes: [
      client,
      {
        id: 'gateway',
        label: 'Gateway',
        type: 'gateway',
        column: 1,
        processMs: 2,
        requireToken: true,
        routes: [
          { prefix: '/orders', to: 'orders' },
          { prefix: '/orders/archive', to: 'archive' },
        ],
      },
      service('orders', 1),
      service('archive', 1),
    ],
    links: [
      { from: 'client', to: 'gateway', latencyMs: 5 },
      { from: 'gateway', to: 'orders', latencyMs: 5 },
      { from: 'gateway', to: 'archive', latencyMs: 5 },
    ],
    requests: [{ label: `GET ${path}`, path, to: 'gateway', at: 0, token }],
    faults: [],
  };
}

function discoveryScenario(instances: number, killAt?: number): Scenario {
  return {
    nodes: [
      { ...client, discovery: { registry: 'registry', service: 'orders' } },
      { id: 'registry', label: 'Registry', type: 'registry', column: 1, processMs: 2, heartbeatMs: 20, ttlMs: 60, serves: ['orders'] },
      service('orders', instances),
    ],
    links: [
      { from: 'client', to: 'registry', latencyMs: 5 },
      { from: 'client', to: 'orders', latencyMs: 5 },
      { from: 'orders', to: 'registry', latencyMs: 5 },
    ],
    requests: Array.from({ length: 10 }, (_, i) => ({ label: 'GET /orders', path: '/orders', to: 'orders', at: 10 + 15 * i })),
    faults: killAt === undefined ? [] : [{ kind: 'kill', instance: `orders-${Math.min(2, instances)}`, at: killAt }],
  };
}

function balancerScenario(strategy: Strategy, options: { slow?: boolean; healthCheckMs?: number; killAt?: number } = {}): Scenario {
  const api = service('api', 3, 20);
  if (api.type === 'service' && options.slow) api.instances[0]!.processMs = 120;
  return {
    nodes: [
      client,
      { id: 'balancer', label: 'Balancer', type: 'balancer', column: 1, processMs: 2, target: 'api', strategy, ...(options.healthCheckMs && { healthCheckMs: options.healthCheckMs }) },
      api,
    ],
    links: [
      { from: 'client', to: 'balancer', latencyMs: 5 },
      { from: 'balancer', to: 'api', latencyMs: 5 },
    ],
    requests: Array.from({ length: 12 }, (_, i) => ({ label: 'GET /items', path: '/items', to: 'balancer', at: 10 * i })),
    faults: options.killAt === undefined ? [] : [{ kind: 'kill', instance: 'api-3', at: options.killAt }],
  };
}

const servedBy = (s: Scenario) => simulate(s).requests.map((r) => r.hops.at(-1));
const count = (items: (string | undefined)[], id: string) => items.filter((x) => x === id).length;

describe('gateway', () => {
  it('routes by the longest matching prefix', () => {
    expect(simulate(gatewayScenario('/orders/42', true)).requests[0]).toMatchObject({ status: 'ok', hops: ['client', 'gateway', 'orders-1'] });
    expect(simulate(gatewayScenario('/orders/archive/1', true)).requests[0]!.hops).toEqual(['client', 'gateway', 'archive-1']);
  });

  it('rejects without a token and with an unknown path, before any backend', () => {
    expect(simulate(gatewayScenario('/orders/42', false)).requests[0]).toMatchObject({ status: 'failed', reason: '401: no token', hops: ['client', 'gateway'] });
    expect(simulate(gatewayScenario('/payments/1', true)).requests[0]).toMatchObject({
      status: 'failed',
      reason: '404: no route for /payments/1',
      hops: ['client', 'gateway'],
    });
  });
});

describe('registry', () => {
  it('evicts an instance once its heartbeats are older than the TTL', () => {
    // Heartbeats every 20 ms take 5 ms to arrive: orders-2's last one (sent at 40) arrives at 45, and 120 is the first tick more than 60 ms later.
    const evictions = simulate(discoveryScenario(3, 50)).trace.filter((e) => e.kind === 'evict');
    expect(evictions).toEqual([{ t: 120, kind: 'evict', registry: 'registry', instance: 'orders-2' }]);
  });

  it('fails requests sent to a dead instance before eviction, and none after', () => {
    const { requests } = simulate(discoveryScenario(3, 50));
    const failed = requests.filter((r) => r.status === 'failed');
    expect(failed.some((r) => r.reason === 'orders-2 refused the connection')).toBe(true);
    for (const r of failed) {
      expect(r.reason).toMatch(/^orders-2 (refused the connection|stopped)$/);
      expect(r.sentAt).toBeLessThan(120);
    }
    expect(requests.filter((r) => r.sentAt >= 120).every((r) => r.status === 'ok')).toBe(true);
  });

  it('spreads looked-up requests over every registered instance', () => {
    const served = servedBy(discoveryScenario(3));
    expect(['orders-1', 'orders-2', 'orders-3'].map((id) => count(served, id))).toEqual([4, 3, 3]);
  });

  it('fails a request when no instance is registered', () => {
    const s = discoveryScenario(1, 0);
    expect(simulate(s).requests[0]).toMatchObject({ status: 'failed', reason: 'no orders instance registered' });
  });
});

describe('balancer', () => {
  it('spreads round robin evenly', () => {
    const served = servedBy(balancerScenario('round-robin'));
    expect(['api-1', 'api-2', 'api-3'].map((id) => count(served, id))).toEqual([4, 4, 4]);
  });

  it('steers least connections away from a slow instance', () => {
    expect(count(servedBy(balancerScenario('least-connections', { slow: true })), 'api-1')).toBeLessThan(
      count(servedBy(balancerScenario('round-robin', { slow: true })), 'api-1'),
    );
  });

  it('picks the same instances for the same seed', () => {
    expect(servedBy(balancerScenario('random'))).toEqual(servedBy(balancerScenario('random')));
    expect(new Set(servedBy(balancerScenario('random'))).size).toBeGreaterThan(1);
  });

  it('stops sending to an instance after a failed health check', () => {
    const { trace } = simulate(balancerScenario('round-robin', { healthCheckMs: 25, killAt: 30 }));
    const mark = trace.find((e) => e.kind === 'mark' && e.instance === 'api-3' && !e.healthy);
    expect(mark).toBeDefined();
    expect(trace.filter((e) => e.kind === 'pick' && e.instance === 'api-3' && e.t > mark!.t)).toEqual([]);
  });

  it('keeps sending to a dead instance without health checks', () => {
    const { requests } = simulate(balancerScenario('round-robin', { killAt: 30 }));
    expect(requests.filter((r) => r.status === 'failed').map((r) => r.id)).toEqual(['#3', '#6', '#9', '#12']);
  });
});

describe('pickInstance', () => {
  it('breaks least-connection ties by lowest index', () => {
    expect(pickInstance('least-connections', ['a', 'b', 'c'], { a: 1, b: 0, c: 0 }, 0, () => 0)).toBe('b');
  });

  it('takes round robin from the cursor and random from the generator', () => {
    expect(pickInstance('round-robin', ['a', 'b', 'c'], {}, 4, () => 0)).toBe('b');
    expect(pickInstance('random', ['a', 'b', 'c'], {}, 0, () => 0.99)).toBe('c');
  });
});

describe('rate limiting', () => {
  it('allows limit requests per fixed window', () => {
    const allow = createLimiter({ algorithm: 'fixed-window', limit: 2, windowMs: 100, per: 'all' });
    expect([0, 10, 20, 100].map((t) => allow('all', t).allowed)).toEqual([true, true, false, true]);
  });

  it('refills a token bucket continuously from full', () => {
    const allow = createLimiter({ algorithm: 'token-bucket', limit: 5, windowMs: 100, per: 'all' });
    expect([0, 0, 0, 0, 0, 0].map((t) => allow('all', t).allowed)).toEqual([true, true, true, true, true, false]);
    expect(allow('all', 20).allowed).toBe(true);
    expect(allow('all', 21).allowed).toBe(false);
  });

  it('reports how much of the limit is used', () => {
    const fixed = createLimiter({ algorithm: 'fixed-window', limit: 2, windowMs: 100, per: 'all' });
    expect([0, 10, 20].map((t) => fixed('all', t).used)).toEqual([1, 2, 2]);
    const bucket = createLimiter({ algorithm: 'token-bucket', limit: 5, windowMs: 100, per: 'all' });
    expect([0, 0, 50].map((t) => bucket('all', t).used)).toEqual([1, 2, 1]);
  });

  it('keeps a separate count per key', () => {
    const allow = createLimiter({ algorithm: 'fixed-window', limit: 1, windowMs: 100, per: 'caller' });
    expect([allow('bob', 0).allowed, allow('bob', 1).allowed, allow('alice', 2).allowed]).toEqual([true, false, true]);
  });

  it('refuses over-limit requests with 429 at the gateway', () => {
    const gateway: NodeSpec = { ...(shared.gateway([{ prefix: '/', to: 'api' }]) as Extract<NodeSpec, { type: 'gateway' }>), rateLimit: { algorithm: 'fixed-window', limit: 1, windowMs: 100, per: 'all' } };
    const result = simulate({
      nodes: [shared.client(), gateway, shared.service('api', 2)],
      links: [shared.link('client', 'gateway'), shared.link('gateway', 'api')],
      requests: [0, 1].map((at) => ({ label: 'GET /', path: '/', to: 'gateway', at })),
      faults: [],
    });
    expect(result.requests[0]!.status).toBe('ok');
    expect(result.requests[1]).toMatchObject({ status: 'failed', reason: '429: rate limit', hops: ['client', 'gateway'] });
    expect(result.trace.find((e) => e.kind === 'reject')).toMatchObject({ status: 429, request: '#2' });
  });
});

describe('gateway reroute', () => {
  it('points a route at another service from its time on', () => {
    const s: Scenario = {
      nodes: [client, shared.gateway([{ prefix: '/orders', to: 'orders' }]), shared.service('orders', 2), shared.service('monolith', 2)],
      links: [shared.link('client', 'gateway'), shared.link('gateway', 'orders'), shared.link('gateway', 'monolith')],
      requests: [0, 150].map((at) => ({ label: 'GET /orders', path: '/orders', to: 'gateway', at })),
      faults: [{ kind: 'reroute', gateway: 'gateway', at: 100, prefix: '/orders', to: 'monolith' }],
    };
    const [before, after] = simulate(s).requests;
    expect(before!.hops).toContain('orders-1');
    expect(after!.hops).toContain('monolith-1');
    expect(after!.status).toBe('ok');
  });

  it('adds a route that did not exist', () => {
    const s: Scenario = {
      nodes: [client, shared.gateway([]), shared.service('monolith', 2)],
      links: [shared.link('client', 'gateway'), shared.link('gateway', 'monolith')],
      requests: [0, 150].map((at) => ({ label: 'GET /x', path: '/x', to: 'gateway', at })),
      faults: [{ kind: 'reroute', gateway: 'gateway', at: 100, prefix: '/', to: 'monolith' }],
    };
    expect(simulate(s).requests.map((r) => r.status)).toEqual(['failed', 'ok']);
  });
});

/** client → lb → app; `versions` gives each instance's version; one request every 30 ms. */
function rollout(versions: string[], faults: Scenario['faults'], requests: number, balancer: Partial<Extract<NodeSpec, { type: 'balancer' }>> = {}): Scenario {
  const app = service('app', versions.length);
  if (app.type === 'service') versions.forEach((v, i) => (app.instances[i]!.version = v));
  return {
    nodes: [client, { id: 'lb', label: 'lb', type: 'balancer', column: 1, processMs: 1, target: 'app', strategy: 'round-robin', ...balancer }, app],
    links: [shared.link('client', 'lb'), shared.link('lb', 'app')],
    requests: Array.from({ length: requests }, (_, i) => ({ label: 'GET /', path: '/', to: 'lb', at: i * 30 })),
    faults,
    seed: 7,
  };
}
const picks = (s: Scenario) => simulate(s).trace.flatMap((e) => (e.kind === 'pick' ? [{ t: e.t, instance: e.instance }] : []));

describe('versions and deploys', () => {
  it('draws versions by weight', () => {
    const rng = seeded(7);
    const draws = Array.from({ length: 400 }, () => pickVersion({ v1: 0.75, v2: 0.25 }, ['v1', 'v2'], rng));
    const share = draws.filter((v) => v === 'v2').length / draws.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.3);
  });

  it('passes the share of a version with nothing in rotation to the others, but never to a version weighted 0', () => {
    expect(pickVersion({ v1: 0.5, v2: 0.5 }, ['v1'], seeded(7))).toBe('v1');
    expect(pickVersion({ v1: 0, v2: 1 }, ['v1'], seeded(7))).toBeUndefined();
    expect(pickVersion({ v1: 1 }, [], seeded(7))).toBeUndefined();
  });

  it('never picks an instance before it starts or while it drains', () => {
    const s = rollout(['v1', 'v2'], [{ kind: 'deploy', instance: 'app-1', at: 100, action: 'stop' }, { kind: 'deploy', instance: 'app-2', at: 100, action: 'start' }], 8);
    const all = picks(s);
    expect(all.filter((p) => p.t < 100).every((p) => p.instance === 'app-1')).toBe(true);
    expect(all.filter((p) => p.t >= 100).every((p) => p.instance === 'app-2')).toBe(true);
    const result = simulate(s);
    expect(result.requests.every((r) => r.status === 'ok')).toBe(true);
    expect(result.trace.find((e) => e.kind === 'drained')).toMatchObject({ instance: 'app-1' });
  });

  it('lets a stopping instance finish the work it holds', () => {
    const s = rollout(['v1', 'v2'], [{ kind: 'deploy', instance: 'app-1', at: 10, action: 'stop' }, { kind: 'deploy', instance: 'app-2', at: 10, action: 'start' }], 1);
    const result = simulate(s);
    expect(result.requests[0]).toMatchObject({ status: 'ok', hops: ['client', 'lb', 'app-1'] });
    const drained = result.trace.find((e) => e.kind === 'drained')!;
    expect(drained.t).toBeGreaterThan(10);
  });

  it('fails with no healthy instance when nothing is in rotation', () => {
    const s = rollout(['v1', 'v2'], [{ kind: 'deploy', instance: 'app-1', at: 50, action: 'stop' }, { kind: 'deploy', instance: 'app-2', at: 150, action: 'start' }], 7);
    const result = simulate(s);
    expect(result.requests.map((r) => r.status)).toEqual(['ok', 'ok', 'failed', 'failed', 'failed', 'ok', 'ok']);
    expect(result.requests[2]!.reason).toBe('no healthy app instance');
  });

  it('rolls the canary back after maxErrors failures', () => {
    const s = rollout(['v1', 'v1', 'v2'], [{ kind: 'errors', node: 'app', version: 'v2', rate: 1, reason: '500: bug in v2' }], 16, {
      weights: { v1: 0.75, v2: 0.25 },
      canary: { version: 'v2', maxErrors: 2 },
    });
    const result = simulate(s);
    const rollback = result.trace.filter((e) => e.kind === 'rollback');
    expect(rollback).toHaveLength(1);
    expect(rollback[0]).toMatchObject({ balancer: 'lb', version: 'v2', errors: 2 });
    expect(result.requests.filter((r) => r.status === 'failed')).toHaveLength(2);
    expect(picks(s).filter((p) => p.t > rollback[0]!.t).every((p) => p.instance !== 'app-3')).toBe(true);
  });

  it('fails with no healthy instance once v2 is rolled back and v1 has drained', () => {
    const s = rollout(['v1', 'v2'], [{ kind: 'errors', node: 'app', version: 'v2', rate: 1, reason: '500: bug' }, { kind: 'deploy', instance: 'app-1', at: 200, action: 'stop' }], 12, {
      weights: { v2: 0.5, v1: 0.5 },
      canary: { version: 'v2', maxErrors: 1 },
    });
    const result = simulate(s);
    const rollback = result.trace.find((e) => e.kind === 'rollback')!;
    expect(rollback.t).toBeLessThan(200);
    expect(picks(s).filter((p) => p.t > rollback.t).every((p) => p.instance === 'app-1')).toBe(true);
    const late = result.requests.filter((r) => r.sentAt > 210);
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((r) => r.reason === 'no healthy app instance')).toBe(true);
  });

  it('applies a shift at its time', () => {
    const s = rollout(['v1', 'v2'], [{ kind: 'shift', balancer: 'lb', at: 100, weights: { v1: 0, v2: 1 } }], 8, { weights: { v1: 1, v2: 0 } });
    const all = picks(s);
    expect(all.filter((p) => p.t < 100).every((p) => p.instance === 'app-1')).toBe(true);
    expect(all.filter((p) => p.t >= 100).every((p) => p.instance === 'app-2')).toBe(true);
  });
});
