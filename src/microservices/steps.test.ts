import { describe, expect, it } from 'vitest';
import type { ServicesView, Step } from '../types/visualization';
import { lineOf } from '../data-structures/shared';
import { MAX_STEPS, type NodeSpec, type Scenario } from './model';
import { simulate } from './sim';
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
