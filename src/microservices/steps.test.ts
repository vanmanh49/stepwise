import { describe, expect, it } from 'vitest';
import type { ServicesView, Step } from '../types/visualization';
import { lineOf } from '../data-structures/shared';
import { MAX_STEPS, type NodeSpec, type Scenario } from './model';
import { simulate } from './sim';
import * as shared from './scenarios/shared';
import { emptyServicesView, recordRows, traceSteps, type StepOptions } from './steps';

const code = `function handle(req) {
  const result = call(next)
  return reply(result)
}
function onHeartbeat(instance) {}
function pick(instances) {}`;

const options: StepOptions = { code, lines: { handle: 'function handle', send: 'call(next)', done: 'return reply', heartbeat: 'onHeartbeat', pick: 'function pick' } };

const client: NodeSpec = { id: 'client', label: 'Client', type: 'client', column: 0 };
const service = (id: string, column: number, calls: string[], count = 1, processMs = 5): NodeSpec => ({
  id,
  label: id,
  type: 'service',
  column,
  instances: Array.from({ length: count }, (_, i) => ({ id: `${id}-${i + 1}`, processMs })),
  calls: calls.map((to) => ({ to })),
  parallel: false,
});

const chain: Scenario = {
  nodes: [client, service('a', 1, ['b']), service('b', 2, [])],
  links: [
    { from: 'client', to: 'a', latencyMs: 10 },
    { from: 'a', to: 'b', latencyMs: 10 },
  ],
  requests: [{ label: 'GET /', path: '/', to: 'a', at: 0 }],
  faults: [],
};

const run = (s: Scenario, o: StepOptions = options) => traceSteps(s, simulate(s), o);
const view = (step: Step) => step.view as ServicesView;

describe('traceSteps', () => {
  it('makes steps with code lines from the snippets', () => {
    const steps = run(chain);
    const lines = code.split('\n').length;
    for (const step of steps) {
      expect(step.codeLine).toBeGreaterThanOrEqual(1);
      expect(step.codeLine).toBeLessThanOrEqual(lines);
    }
    const handle = steps.find((s) => s.title === 'a-1 starts on #1')!;
    expect(handle.codeLine).toBe(lineOf(code, 'function handle'));
    expect(handle.variables).toMatchObject({ t: '10 ms', request: '#1' });
    expect(steps.at(-1)!.title).toBe('#1 succeeds after 50 ms');
  });

  it('folds an arrival into the handling that follows it', () => {
    const titles = run(chain).map((s) => s.title);
    expect(titles.some((t) => t.includes('reaches a-1'))).toBe(false);
    expect(titles).toContain('a-1 starts on #1');
  });

  it('moves a message from progress 0 to 1 and then drops it', () => {
    const steps = run(chain);
    const seen = steps.map((s) => view(s).messages.find((m) => m.id === 'm1')?.progress);
    const first = seen.indexOf(0);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(seen[first + 1]).toBe(1);
    expect(seen.slice(first + 2).every((p) => p === undefined)).toBe(true);
    expect(view(steps[first]!).messages[0]).toMatchObject({ from: 'client', to: 'a', label: 'GET / #1', role: 'frontier' });
  });

  it('marks a dead instance and its failed reply discarded', () => {
    const steps = run({ ...chain, faults: [{ kind: 'kill', instance: 'b-1', at: 0 }] });
    const failedReply = steps.flatMap((s) => view(s).messages).find((m) => m.label.startsWith('failed'));
    expect(failedReply?.role).toBe('discarded');
    const last = view(steps.at(-1)!);
    expect(last.nodes.find((n) => n.id === 'b')!.instances![0]!.role).toBe('discarded');
    expect(last.requests[0]).toMatchObject({ status: 'failed', reason: 'b-1 refused the connection', hops: 'client → a-1' });
  });

  it('gives the reason for a failure without capitalising an instance id', () => {
    const steps = run({ ...chain, faults: [{ kind: 'kill', instance: 'b-1', at: 0 }] });
    expect(steps.at(-1)!.why).toBe('Reason: b-1 refused the connection.');
  });

  it('merges consecutive heartbeats into one step', () => {
    const s: Scenario = {
      nodes: [client, { id: 'registry', label: 'Registry', type: 'registry', column: 1, processMs: 2, heartbeatMs: 20, ttlMs: 60, serves: ['orders'] }, service('orders', 2, [], 3)],
      links: [
        { from: 'client', to: 'orders', latencyMs: 5 },
        { from: 'orders', to: 'registry', latencyMs: 5 },
      ],
      requests: [{ label: 'GET /', path: '/', to: 'orders', at: 50 }],
      faults: [],
    };
    const steps = run(s);
    const beats = steps.filter((st) => /heartbeats? reach/.test(st.title));
    expect(beats.length).toBeGreaterThanOrEqual(1);
    expect(beats[0]!.title).toBe('3 heartbeats reach the registry');
    expect(beats.every((st) => st.title === '3 heartbeats reach the registry')).toBe(true);
    expect(steps.some((st) => st.title === 'Orders-1 sends a heartbeat' || st.title === 'orders-1 sends a heartbeat')).toBe(false);
    const withBadges = view(beats[0]!).nodes.find((n) => n.id === 'orders')!.instances!;
    expect(withBadges.map((i) => i.badge)).toEqual(['♥ 0 ms', '♥ 0 ms', '♥ 0 ms']);
  });

  it('lets a lesson override the wording and add variables', () => {
    const steps = run(chain, { ...options, explain: (e) => (e.kind === 'done' ? { why: 'custom' } : undefined), variables: () => ({ extra: 1 }) });
    expect(steps.at(-1)).toMatchObject({ title: '#1 succeeds after 50 ms', why: 'custom' });
    expect(steps[0]!.variables).toMatchObject({ extra: 1 });
  });

  it('caps a long run at MAX_STEPS plus one summary step with every request finished', () => {
    const s: Scenario = {
      nodes: [client, { id: 'lb', label: 'Balancer', type: 'balancer', column: 1, processMs: 2, target: 'api', strategy: 'least-connections', healthCheckMs: 10 }, service('api', 2, [], 4, 20)],
      links: [
        { from: 'client', to: 'lb', latencyMs: 5 },
        { from: 'lb', to: 'api', latencyMs: 5 },
      ],
      requests: Array.from({ length: 40 }, (_, i) => ({ label: 'GET /', path: '/', to: 'lb', at: 5 * i })),
      faults: [],
    };
    const steps = run(s);
    expect(steps).toHaveLength(MAX_STEPS + 1);
    const last = view(steps.at(-1)!);
    expect(last.requests).toHaveLength(40);
    expect(last.requests.every((r) => r.status !== 'pending')).toBe(true);
    expect(steps.at(-1)!.title).toMatch(/^\d+ more steps$/);
  });

  it("uses a lesson's code line for an event and capitalises a why that starts with a node", () => {
    const steps = run(chain, { ...options, explain: (e) => (e.kind === 'done' ? { line: 'function pick' } : undefined) });
    expect(steps.at(-1)!.codeLine).toBe(lineOf(code, 'function pick'));
    const fromClient = steps.find((s) => s.title === '#1 leaves the client for a-1')!;
    expect(fromClient.why).toBe('The client sends GET / #1. Crossing the network takes 10 ms.');
  });

  it('starts from an empty view for refusals', () => {
    expect(emptyServicesView()).toEqual({ kind: 'services', nodes: [], links: [], messages: [], requests: [], log: [] });
  });
});

describe('traceSteps: phase 2 faults and service options', () => {
  const at = (time: number): Scenario['requests'][number] => ({ label: 'GET /', path: '/', to: 'api', at: time });
  const single = (faults: Scenario['faults'], requests = [at(0), at(40), at(120)], processMs = 30): Scenario => ({
    nodes: [shared.client(), shared.service('api', 1, [], { processMs })],
    links: [shared.link('client', 'api')],
    requests,
    faults,
  });
  const titles = (s: Scenario) => run(s).map((step) => step.title);

  it('narrates a refuse outage and marks the instances dead until they recover', () => {
    const steps = run(single([{ kind: 'outage', node: 'api', from: 20, until: 100, mode: 'refuse' }]));
    const stops = steps.findIndex((s) => s.title === 'api stops answering');
    const back = steps.findIndex((s) => s.title === 'api is back');
    expect(stops).toBeGreaterThanOrEqual(0);
    expect(back).toBeGreaterThan(stops);
    for (const step of steps.slice(stops, back)) expect(view(step).nodes.find((n) => n.id === 'api')!.instances![0]!.role).toBe('discarded');
    expect(view(steps[back]!).nodes.find((n) => n.id === 'api')!.instances![0]!.role).not.toBe('discarded');
  });

  it('narrates a hang', () => {
    expect(titles(single([{ kind: 'outage', node: 'api', from: 0, until: 50, mode: 'hang' }], [at(0), at(60)], 10))).toContain('api hangs');
  });

  it('narrates a lost reply', () => {
    expect(titles(single([{ kind: 'lose-reply', node: 'api', request: '#2' }], [at(0), at(50)], 10))).toContain('The reply to #2 is lost on the way');
  });

  it('narrates replayed and refused duplicates', () => {
    const dedupe = (parallel: boolean): Scenario => ({
      nodes: [shared.client(), shared.service('s1', 1, ['api', 'api'], { parallel }), shared.service('api', 2, [], { dedupe: true })],
      links: [shared.link('client', 's1'), shared.link('s1', 'api')],
      requests: [{ label: 'GET /', path: '/', to: 's1', at: 0 }],
      faults: [],
    });
    expect(titles(dedupe(false))).toContain('api-1 has already handled #1, so it returns the saved result');
    expect(titles(dedupe(true))).toContain('api-1 is still working on #1, so it turns the repeat away');
  });
});

describe('traceSteps: call policies', () => {
  const at = (time: number, to = 'api'): Scenario['requests'][number] => ({ label: 'GET /', path: '/', to, at: time });
  const refuse = (node: string, until: number): Scenario['faults'][number] => ({ kind: 'outage', node, from: 0, until, mode: 'refuse' });
  const titles = (steps: Step[]) => steps.map((s) => s.title);

  it('narrates a timeout with the caller service and its target, and the late answer', () => {
    const s: Scenario = {
      nodes: [shared.client(), shared.service('api', 1, [{ to: 'inventory', policy: { timeoutMs: 200 } }]), shared.service('inventory', 2, [], { processMs: 600 })],
      links: [shared.link('client', 'api'), shared.link('api', 'inventory')],
      requests: [at(0)],
      faults: [],
    };
    const all = titles(run(s));
    expect(all).toContain('api gives up on inventory after 200 ms');
    expect(all.some((t) => t.includes('too late'))).toBe(true);
  });

  it('narrates a retry with its wait and count, and counts tries on the row', () => {
    const s: Scenario = {
      nodes: [shared.client(), shared.service('api', 1)],
      links: [shared.link('client', 'api')],
      requests: [at(0)],
      faults: [refuse('api', 1000)],
      clientPolicy: { retry: { attempts: 2, backoff: 'fixed', baseMs: 50, jitter: false } },
    };
    const steps = run(s);
    expect(titles(steps)).toContain('#1 tries again in 50 ms (retry 1 of 2)');
    expect(view(steps.at(-1)!).requests[0]!.attempts).toBe(3);
  });

  it('narrates the breaker and shows its state on the caller', () => {
    const s: Scenario = {
      nodes: [shared.client(), shared.service('api', 1, [{ to: 'payments', policy: { breaker: { threshold: 3, openMs: 1000 } } }]), shared.service('payments', 2)],
      links: [shared.link('client', 'api'), shared.link('api', 'payments')],
      requests: [0, 40, 80, 120, 160, 200, 240].map((t) => at(t)),
      faults: [refuse('payments', 5000)],
    };
    const steps = run(s);
    expect(titles(steps)).toContain('The breaker on api → payments opens after 3 failures in a row');
    expect(titles(steps)).toContain('api turns #4 away: circuit open');
    const api = (step: Step) => view(step).nodes.find((n) => n.id === 'api')!.badge;
    expect(steps.map(api)).toContain('breaker closed 2/3');
    expect(api(steps.at(-1)!)).toBe('breaker open');
  });

  it('shows bulkhead pools as badges without giving pool changes their own steps', () => {
    const pool = (name: string, size: number) => ({ bulkhead: { pool: name, size } });
    const s: Scenario = {
      nodes: [
        shared.client(),
        shared.service('api', 1, [
          { to: 'recs', when: '/recs', policy: pool('recs', 2) },
          { to: 'checkout', when: '/checkout', policy: pool('checkout', 2) },
        ]),
        shared.service('recs', 2, [], { processMs: 300 }),
        shared.service('checkout', 2),
      ],
      links: [shared.link('client', 'api'), shared.link('api', 'recs'), shared.link('api', 'checkout')],
      requests: [0, 10, 20].map((t) => ({ label: 'GET /recs', path: '/recs', to: 'api', at: t })),
      faults: [],
    };
    const steps = run(s);
    expect(steps.map((step) => view(step).nodes.find((n) => n.id === 'api')!.badge)).toContain('recs 2/2, checkout 0/2');
    expect(titles(steps).some((t) => t.includes('slots in'))).toBe(false);
    const single: Scenario = { ...s, nodes: [s.nodes[0]!, shared.service('api', 1, [{ to: 'recs', policy: pool('p', 1) }]), s.nodes[2]!], links: s.links.slice(0, 2), requests: [at(0)] };
    expect(run(single).map((step) => view(step).nodes.find((n) => n.id === 'api')!.badge)).toContain('pool 1/1');
  });
});

describe('traceSteps: rate limiting', () => {
  const limited = (rateLimit: Extract<NodeSpec, { type: 'gateway' }>['rateLimit'], callers: string[]): Scenario => ({
    nodes: [shared.client(), { ...(shared.gateway([{ prefix: '/', to: 'api' }]) as Extract<NodeSpec, { type: 'gateway' }>), rateLimit }, shared.service('api', 2)],
    links: [shared.link('client', 'gateway'), shared.link('gateway', 'api')],
    requests: callers.map((caller, i) => ({ label: `GET / (${caller})`, path: '/', to: 'gateway', at: i, caller })),
    faults: [],
  });
  const gatewayBadges = (steps: Step[]) => steps.map((step) => view(step).nodes.find((n) => n.id === 'gateway')!.badge);

  it('narrates fixed-window checks and refusals, with a badge', () => {
    const steps = run(limited({ algorithm: 'fixed-window', limit: 5, windowMs: 100, per: 'all' }, Array(6).fill('alice')));
    const titles = steps.map((s) => s.title);
    expect(titles).toContain('The gateway lets #1 through: 1 of 5 used');
    expect(titles).toContain('The gateway refuses #6 with 429: 5 of 5 used in this window');
    expect(gatewayBadges(steps)).toContain('5/5 this window');
  });

  it('narrates an empty token bucket, with a badge', () => {
    const steps = run(limited({ algorithm: 'token-bucket', limit: 5, windowMs: 100, per: 'all' }, Array(7).fill('alice')));
    expect(steps.map((s) => s.title)).toContain('The gateway refuses #7 with 429: no tokens left');
    expect(gatewayBadges(steps)).toContain('tokens 0/5');
  });

  it('shows each caller in the badge when limits are per caller', () => {
    const steps = run(limited({ algorithm: 'fixed-window', limit: 5, windowMs: 100, per: 'caller' }, [...Array(6).fill('bob'), 'alice']));
    expect(gatewayBadges(steps)).toContain('bob 5/5, alice 1/5');
    expect(steps.map((s) => s.title)).toContain('The gateway refuses #6 with 429: 5 of 5 used by bob in this window');
  });
});

describe('traceSteps: broker', () => {
  const topic = (times: number[], consumers = ['a', 'b']): Scenario => ({
    nodes: [shared.client(), shared.broker('jobs', 1, 'topic', consumers), ...consumers.map((c) => shared.service(c, 2, [], { processMs: 60 }))],
    links: [shared.link('client', 'jobs'), ...consumers.map((c) => shared.link('jobs', c))],
    requests: times.map((at) => ({ label: 'POST /job', path: '/job', to: 'jobs', at })),
    faults: [],
  });

  it('narrates storing, delivering and finishing, with delivery rows after each request', () => {
    const steps = run(topic([0, 5], ['a', 'b', 'c']));
    const titles = steps.map((s) => s.title);
    expect(titles).toContain('The broker stores #1 in 3 queues');
    expect(titles).toContain('a-1 finishes #1');
    const last = view(steps.at(-1)!);
    expect(last.requests.map((r) => r.id)).toEqual(['#1', '#1/a', '#1/b', '#1/c', '#2', '#2/a', '#2/b', '#2/c']);
    expect(last.requests.every((r) => r.status !== 'pending')).toBe(true);
    expect(last.requests.find((r) => r.id === '#1/a')!.label).toBe('POST /job → a');
  });

  it('shows each queue as a row with what is waiting', () => {
    const steps = run(topic([0, 1, 2]));
    const queues = steps.flatMap((s) => view(s).nodes.find((n) => n.id === 'jobs')!.instances!.map((q) => q.badge));
    expect(queues).toContain('2 waiting');
    expect(view(steps.at(-1)!).nodes.find((n) => n.id === 'jobs')).toMatchObject({ type: 'broker', instances: [{ id: 'a', badge: 'empty' }, { id: 'b', badge: 'empty' }] });
  });

  it('narrates a requeue', () => {
    const s: Scenario = { ...topic([0], ['a']), faults: [{ kind: 'outage', node: 'a', from: 0, until: 100, mode: 'refuse' }] };
    expect(run(s).map((step) => step.title)).toContain('The broker puts #1 back in the queue');
  });
});

describe('traceSteps: records and values', () => {
  const dataScenario = (calls: NonNullable<Extract<NodeSpec, { type: 'service' }>['calls']>, records?: Record<string, string>, value?: string): Scenario => ({
    nodes: [shared.client(), shared.service('api', 1, calls), shared.db('db', 2, [], { ...(records && { records }) })],
    links: [shared.link('client', 'api'), shared.link('api', 'db')],
    requests: [{ label: 'POST /orders', path: '/orders', to: 'api', at: 0, ...(value && { value }) }],
    faults: [],
  });

  it('narrates writes, deletes and reads', () => {
    const titles = run(
      dataScenario(
        [
          { to: 'db', data: { write: { 'order {req}': '{value}', 'outbox/{req}': 'OrderPlaced' } } },
          { to: 'db', data: { delete: ['outbox/{req}'] } },
          { to: 'db', data: { add: { balance: '-20' } } },
          { to: 'db', data: { read: 'balance' } },
          { to: 'db', data: { read: 'nope' } },
        ],
        { balance: '100' },
        'placed',
      ),
    ).map((s) => s.title);
    expect(titles).toContain('db saves order #1 = placed, outbox/#1 = OrderPlaced');
    expect(titles).toContain('db deletes outbox/#1');
    expect(titles).toContain('db saves balance = 80');
    expect(titles).toContain('db reads balance = 80');
    expect(titles).toContain('db finds no nope');
  });

  it('draws records as rows in the db box, the changed one active', () => {
    const steps = run(dataScenario([{ to: 'db', data: { write: { 'order {req}': 'placed' } } }], { 'order #0': 'old' }));
    const first = view(steps[0]!).nodes.find((n) => n.id === 'db')!;
    expect(first.instances).toEqual([{ id: 'order #0', role: 'default', badge: 'old' }]);
    const saved = steps.find((s) => s.title.startsWith('db saves'))!;
    expect(view(saved).nodes.find((n) => n.id === 'db')!.instances).toEqual([
      { id: 'order #0', role: 'default', badge: 'old' },
      { id: 'order #1', role: 'active', badge: 'placed' },
    ]);
  });

  it('shows the value that reached the client in the request row', () => {
    const steps = run(dataScenario([{ to: 'db', data: { read: 'balance' } }], { balance: '80' }));
    expect(view(steps.at(-1)!).requests[0]).toMatchObject({ status: 'ok', value: '80' });
  });

  it('keeps the newest 5 records and folds the rest into one row', () => {
    const records = Array.from({ length: 8 }, (_, i): [string, string] => [`e${i + 1}`, `+${i}`]);
    const rows = recordRows(records, new Set(['e8']));
    expect(rows.map((r) => r.id)).toEqual(['+3 older', 'e4', 'e5', 'e6', 'e7', 'e8']);
    expect(rows.at(-1)!.role).toBe('active');
    expect(recordRows(records.slice(0, 6), new Set()).map((r) => r.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);
  });

  it('cuts a long value to 24 characters', () => {
    const [row] = recordRows([['k', 'x'.repeat(40)]], new Set());
    expect(row!.badge).toHaveLength(24);
    expect(row!.badge.endsWith('…')).toBe(true);
  });
});

describe('traceSteps: saga, errors and reroute', () => {
  const sagaScenario: Scenario = {
    nodes: [
      shared.client(),
      shared.service('orders', 1, [
        { to: 'payments', path: '/pay', compensate: { to: 'payments', path: '/refund' } },
        { to: 'inventory', path: '/reserve' },
      ]),
      shared.service('payments', 2),
      shared.service('inventory', 2),
    ],
    links: [shared.link('client', 'orders'), shared.link('orders', 'payments'), shared.link('orders', 'inventory')],
    requests: [{ label: 'POST /orders', path: '/orders', to: 'orders', at: 0 }],
    faults: [{ kind: 'errors', node: 'inventory', rate: 1, reason: 'out of stock' }],
  };

  it('narrates a compensation and an error answer', () => {
    const titles = run(sagaScenario).map((s) => s.title);
    expect(titles).toContain('orders undoes payments for #1: /refund');
    expect(titles).toContain('inventory-1 fails #1: out of stock');
  });

  it('narrates a route change', () => {
    const s: Scenario = {
      nodes: [shared.client(), shared.gateway([{ prefix: '/orders', to: 'orders' }]), shared.service('orders', 2), shared.service('monolith', 2)],
      links: [shared.link('client', 'gateway'), shared.link('gateway', 'orders'), shared.link('gateway', 'monolith')],
      requests: [{ label: 'GET /orders', path: '/orders', to: 'gateway', at: 150 }],
      faults: [{ kind: 'reroute', gateway: 'gateway', at: 100, prefix: '/orders', to: 'monolith' }],
    };
    const steps = run(s);
    expect(steps.map((x) => x.title)).toContain('The gateway now sends /orders to monolith');
    expect(steps.find((x) => x.title.startsWith('The gateway routes'))!.why).toContain('monolith');
  });
});

describe('traceSteps: outbox relay', () => {
  const outboxShop = (records?: Record<string, string>, faults: Scenario['faults'] = []): Scenario => ({
    nodes: [
      shared.client(),
      shared.service('orders', 1, [{ to: 'db', data: { write: { 'order {req}': 'placed', 'outbox/{req}': 'OrderPlaced' } } }]),
      shared.db('db', 2, [], { ...(records && { records }) }),
      shared.broker('events', 2, 'queue', ['email']),
      shared.service('email', 3),
      shared.relayNode('relay', 2, 'db', 'events'),
    ],
    links: [shared.link('client', 'orders'), shared.link('orders', 'db'), shared.link('events', 'email'), shared.link('relay', 'db'), shared.link('relay', 'events')],
    requests: [{ label: 'POST /orders', path: '/orders', to: 'orders', at: 0 }],
    faults,
  });

  it('narrates polls and shows the relay badge', () => {
    const steps = run(outboxShop());
    const titles = steps.map((s) => s.title);
    expect(titles).toContain('The relay finds 1 unsent event: #1');
    expect(titles).not.toContain('The relay queries db for undefined');
    expect(view(steps[0]!).nodes.find((n) => n.id === 'relay')).toMatchObject({ type: 'relay', badge: 'polls every 40 ms' });
  });

  it('narrates an empty poll', () => {
    const s = outboxShop();
    const late: Scenario = { ...s, requests: [{ ...s.requests[0]!, at: 50 }] };
    expect(run(late).map((x) => x.title)).toContain('The relay finds nothing to send');
  });

  it('tells never-published events from published ones still in the outbox when the run is cut short', () => {
    // The relay publishes #0 and #1, but their deletes reach the db after it goes down at 70 ms. email hangs on the
    // delivery, so the run lasts until 10,000 ms with both rows still there.
    const hung: Scenario = {
      ...outboxShop({ 'outbox/#0': 'OrderPlaced' }),
      faults: [
        { kind: 'down', node: 'db', at: 70 },
        { kind: 'outage', node: 'email', from: 0, until: 20_000, mode: 'hang' },
      ],
    };
    const published = run(hung);
    expect(published).toHaveLength(MAX_STEPS + 1);
    expect(published.at(-1)!.why).toContain('2 published events are still in the outbox');
    expect(published.at(-1)!.why).not.toContain('never published');
    // With the db down before the first poll at 40 ms, the relay never reads a row; a second request that hangs at
    // orders keeps the run going.
    const early = run({
      ...hung,
      requests: [...hung.requests, { label: 'POST /orders', path: '/orders', to: 'orders', at: 60 }],
      faults: [{ kind: 'down', node: 'db', at: 30 }, { kind: 'outage', node: 'orders', from: 50, until: 20_000, mode: 'hang' }],
    });
    expect(early.some((x) => x.title === "The relay can't read the outbox: db is down")).toBe(true);
    expect(early.at(-1)!.why).toContain('2 events were never published');
  });

  it('marks an instance alive again when it restarts', () => {
    const s: Scenario = {
      ...chain,
      requests: [{ label: 'GET /', path: '/', to: 'a', at: 0 }, { label: 'GET /', path: '/', to: 'a', at: 100 }],
      faults: [{ kind: 'crash-after', node: 'a', after: 'b', request: '#1', restartMs: 20 }],
    };
    const steps = run(s);
    const back = steps.find((x) => x.title === 'a-1 is back')!;
    expect(view(back).nodes.find((n) => n.id === 'a')!.instances![0]!.role).not.toBe('discarded');
  });
});

describe('traceSteps: event store', () => {
  const ledger = (ops: number, snapshotEvery?: number): Scenario => ({
    nodes: [
      shared.client(),
      shared.service('account', 1, [
        { to: 'account-db', when: 'POST', data: { append: '{value}' } },
        { to: 'account-db', when: 'GET', data: { read: 'balance' } },
      ]),
      shared.db('account-db', 2, [], { events: { perEventMs: 2, ...(snapshotEvery && { snapshotEvery }) } }),
    ],
    links: [shared.link('client', 'account'), shared.link('account', 'account-db')],
    requests: [
      ...Array.from({ length: ops }, (_, i) => ({ label: 'POST /account', path: 'POST /account', to: 'account', at: i * 20, value: ['+50', '-20', '+100', '-30', '+10'][i % 5]! })),
      { label: 'GET /balance', path: 'GET /balance', to: 'account', at: ops * 20 },
    ],
    faults: [],
  });

  it('narrates appends, snapshots and replays', () => {
    const titles = run(ledger(8, 5)).map((s) => s.title);
    expect(titles).toContain('account-db appends e3: +100');
    expect(titles).toContain('account-db stores snapshot @5 = 110');
    expect(titles).toContain('account-db replays 3 events to answer #9');
  });

  it('shows the events as records in the db box', () => {
    const last = view(run(ledger(8)).at(-1)!).nodes.find((n) => n.id === 'account-db')!;
    expect(last.instances!.map((r) => r.id)).toEqual(['+3 older', 'e4', 'e5', 'e6', 'e7', 'e8']);
  });
});

describe('traceSteps: deploys and canaries', () => {
  const rollout = (faults: Scenario['faults'], balancer: Partial<Extract<NodeSpec, { type: 'balancer' }>> = {}): Scenario => {
    const app = shared.service('app', 2, [], { count: 2 });
    if (app.type === 'service') ['v1', 'v2'].forEach((v, i) => (app.instances[i]!.version = v));
    return {
      nodes: [shared.client(), { id: 'lb', label: 'lb', type: 'balancer', column: 1, processMs: 1, target: 'app', strategy: 'round-robin', ...balancer }, app],
      links: [shared.link('client', 'lb'), shared.link('lb', 'app')],
      requests: Array.from({ length: 6 }, (_, i) => ({ label: 'GET /', path: '/', to: 'lb', at: i * 30 })),
      faults,
      seed: 7,
    };
  };

  it('narrates a stop, a drain and a start, with version badges', () => {
    const steps = run(rollout([{ kind: 'deploy', instance: 'app-1', at: 50, action: 'stop' }, { kind: 'deploy', instance: 'app-2', at: 50, action: 'start' }]));
    const titles = steps.map((s) => s.title);
    expect(titles).toContain('app-1 (v1) leaves rotation and finishes its work');
    expect(titles).toContain('app-2 (v2) starts serving');
    expect(titles).toContain('app-1 (v1) has stopped');
    const app = view(steps[0]!).nodes.find((n) => n.id === 'app')!;
    expect(app.instances!.map((i) => i.badge)).toEqual(['v1', 'v2, not started']);
    expect(app.instances![1]!.role).toBe('default');
    const end = view(steps.at(-1)!).nodes.find((n) => n.id === 'app')!;
    expect(end.instances!.map((i) => i.badge)).toEqual(['v1, stopped', 'v2']);
  });

  it('narrates a shift and a rollback, with weight badges', () => {
    const steps = run(
      rollout([{ kind: 'errors', node: 'app', version: 'v2', rate: 1, reason: '500: bug' }], { weights: { v1: 0.5, v2: 0.5 }, canary: { version: 'v2', maxErrors: 1 } }),
    );
    expect(steps.map((s) => s.title)).toContain('The balancer rolls back v2 after 1 error');
    expect(view(steps[0]!).nodes.find((n) => n.id === 'lb')!.badge).toBe('v1 50%, v2 50%');
    expect(view(steps.at(-1)!).nodes.find((n) => n.id === 'lb')!.badge).toBe('v2 rolled back');
    const shifted = run(rollout([{ kind: 'shift', balancer: 'lb', at: 40, weights: { v1: 0, v2: 1 } }], { weights: { v1: 1, v2: 0 } }));
    expect(shifted.map((s) => s.title)).toContain('The balancer now sends v1 0%, v2 100%');
    for (const step of shifted) for (const n of view(step).nodes) expect((n.badge ?? '').length).toBeLessThanOrEqual(24);
  });
});

describe('traceSteps: sidecars', () => {
  const mesh = (mtls: boolean, faults: Scenario['faults'], requests: Scenario['requests']): Scenario => ({
    nodes: [
      shared.client(),
      shared.service('orders', 1, ['payments']),
      shared.service('payments', 2),
      shared.sidecarNode('orders', 1, { policy: { retry: { attempts: 2, backoff: 'fixed', baseMs: 10, jitter: false } } }),
      shared.sidecarNode('payments', 2, { mtls }),
    ],
    links: [shared.link('client', 'orders-proxy'), shared.link('orders-proxy', 'orders', 1), shared.link('orders-proxy', 'payments-proxy'), shared.link('payments-proxy', 'payments', 1), shared.link('client', 'payments-proxy')],
    requests,
    faults,
  });
  const order = { label: 'POST /orders', path: '/orders', to: 'orders', at: 0 };

  it('narrates the hand-off, a sidecar retry and the badge', () => {
    const steps = run(mesh(false, [{ kind: 'outage', node: 'payments', from: 0, until: 30, mode: 'refuse' }], [order]));
    const titles = steps.map((s) => s.title);
    expect(titles).toContain('orders-1 hands #1 to its sidecar');
    expect(titles).toContain('orders-proxy tries #1 again in 10 ms (retry 1 of 2)');
    expect(view(steps.at(-1)!).nodes.find((n) => n.id === 'orders-proxy')).toMatchObject({ type: 'sidecar', badge: '3 calls, 1 retried' });
  });

  it('narrates an mTLS refusal', () => {
    const steps = run(mesh(true, [], [{ label: 'GET /charges', path: '/charges', to: 'payments', at: 0, caller: 'scraper' }]));
    expect(steps.map((s) => s.title)).toContain('payments-proxy refuses #1: 403: no client certificate');
  });
});

describe('traceSteps: extend', () => {
  it('merges extra view data into every step', () => {
    const spans = { title: 'trace of #1', endMs: 40, nowMs: 0, rows: [] };
    const steps = run(chain, { ...options, extend: () => ({ spans }) });
    expect(steps.every((s) => view(s).spans === spans)).toBe(true);
  });

  it('adds no spans key without extend', () => {
    expect(run(chain).every((s) => !('spans' in view(s)))).toBe(true);
  });
});
