import { describe, expect, it } from 'vitest';
import type { ServicesView, Step } from '../types/visualization';
import { lineOf } from '../data-structures/shared';
import { MAX_STEPS, type NodeSpec, type Scenario } from './model';
import { simulate } from './sim';
import * as shared from './scenarios/shared';
import { emptyServicesView, traceSteps, type StepOptions } from './steps';

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
  });
});
