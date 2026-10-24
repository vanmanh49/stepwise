import { describe, expect, it } from 'vitest';
import type { ClusterView } from '../types/visualization';
import { deploymentOf, nodesOf } from './fixtures.testutil';
import { MAX_STEPS, type Frame, type Scenario, type SimResult } from './model';
import { simulate } from './sim';
import { traceSteps, type StepOptions } from './steps';

const code = `observe the cluster
create the missing pods
bind each pod to a node
start the container`;

const options: StepOptions = { code, lines: { 'create-pod': 'create the missing', bind: 'bind each', start: 'start the' } };
const scenario = (extra: Partial<Scenario> = {}): Scenario => ({ nodes: nodesOf(3), actions: [{ at: 0, kind: 'apply', object: deploymentOf('web', 3) }], faults: [], ...extra });
const views = (steps: { view: unknown }[]) => steps.map((s) => s.view as ClusterView);

describe('traceSteps', () => {
  it('merges same-second creates into one step', () => {
    const steps = traceSteps(simulate(scenario()), options);
    const creates = steps.filter((s) => s.title.includes('creates 3 pods'));
    expect(creates).toHaveLength(1);
    expect(creates[0]!.title).toMatch(/^ReplicaSet web-[a-z0-9]{2} creates 3 pods: web-\w+-\w{3}, web-\w+-\w{3}, web-\w+-\w{3}$/);
    expect(steps.filter((s) => s.title.startsWith('scheduler binds 3 pods'))).toHaveLength(1);
  });

  it('highlights every pod and node of a merged step', () => {
    const steps = traceSteps(simulate(scenario()), options);
    const view = steps.find((s) => s.title.startsWith('3 pods are ready'))!.view as ClusterView;
    expect(view.nodes.map((n) => n.role)).toEqual(['active', 'active', 'active']);
    expect(view.nodes.flatMap((n) => n.pods.map((p) => p.role))).toEqual(['active', 'active', 'active']);
  });

  it('hides no-op reconciles unless asked', () => {
    const result = simulate(scenario());
    expect(traceSteps(result, options).some((s) => s.title.includes('nothing to do'))).toBe(false);
    expect(traceSteps(result, { ...options, noops: true }).some((s) => s.title.includes('nothing to do'))).toBe(true);
  });

  it('points code lines through lineOf, and every line is inside the code', () => {
    const steps = traceSteps(simulate(scenario()), options);
    expect(steps.find((s) => s.title.includes('creates 3 pods'))!.codeLine).toBe(2);
    expect(steps.find((s) => s.title.includes('binds'))!.codeLine).toBe(3);
    for (const step of steps) expect(step.codeLine).toBeGreaterThanOrEqual(1);
    for (const step of steps) expect(step.codeLine).toBeLessThanOrEqual(4);
  });

  it('lets a lesson reword a step and pick its line', () => {
    const steps = traceSteps(simulate(scenario()), { ...options, explain: (e) => (e.kind === 'ready' ? { title: 'All set', why: 'Because.', line: 'observe' } : undefined) });
    const ready = steps.find((s) => s.title === 'All set')!;
    expect(ready).toMatchObject({ why: 'Because.', codeLine: 1 });
  });

  it('fills variables for the focus workload, and says what comes next', () => {
    const steps = traceSteps(simulate(scenario()), { ...options, focus: 'web' });
    const last = steps.at(-1)!;
    expect(last.variables).toMatchObject({ desired: 3, current: 3, ready: 3 });
    expect(last.variables!.t).toMatch(/^\d+ s$/);
    expect(steps[0]!.variables).toEqual({ t: '0 s', desired: 3, current: 0, ready: 0 });
    expect(traceSteps(simulate(scenario()), { ...options, focus: 'nope' })[0]!.variables).toEqual({ t: '0 s' });
    expect(steps[0]!.next).toBe(steps[1]!.title);
    expect(last.next).toBeUndefined();
  });

  it('lists the newest steps in the log', () => {
    const steps = traceSteps(simulate(scenario()), options);
    const log = views(steps).at(-1)!.log;
    expect(log).toHaveLength(4);
    expect(log.at(-1)).toBe(`t=${steps.at(-1)!.variables!.t} · ${steps.at(-1)!.title}`);
  });

  it('ends with a summary step past MAX_STEPS', () => {
    const real = simulate(scenario());
    const frame = real.frames.at(-1)!;
    const frames: Frame[] = Array.from({ length: 250 }, (_, i) => ({ event: { ...frame.event, t: i, kind: 'ready', text: `step ${i}` }, state: { ...frame.state, t: i } }));
    const result: SimResult = { frames, endedAt: 249, cutOff: false };
    const steps = traceSteps(result, options);
    expect(steps).toHaveLength(MAX_STEPS + 1);
    expect(steps.at(-1)!.title).toBe('After 249 s: Deployment web has 3 of 3 pods ready');
  });

  it('ends a cut-off run with a summary step', () => {
    const steps = traceSteps({ ...simulate(scenario()), cutOff: true, endedAt: 600 }, options);
    expect(steps.at(-1)!.title).toBe('After 600 s: Deployment web has 3 of 3 pods ready');
    expect(steps.at(-1)!.why).toContain('stops at 600 s');
  });

  it('marks Lost pods and NotReady nodes', () => {
    const steps = traceSteps(simulate(scenario({ faults: [{ kind: 'node-down', node: 'node-2', at: 20 }] })), options);
    const lost = views(steps).find((v) => v.nodes.some((n) => n.pods.some((p) => p.phase === 'Lost')))!;
    const node2 = lost.nodes.find((n) => n.name === 'node-2')!;
    expect(node2).toMatchObject({ ready: false, offline: true, role: 'discarded' });
    expect(node2.pods.every((p) => p.role === 'discarded' || p.role === 'active')).toBe(true);
    const silent = views(steps).find((v) => v.nodes.some((n) => n.offline && n.ready))!;
    expect(silent.nodes.find((n) => n.name === 'node-2')!.ready).toBe(true);
  });

  it('never repeats a pod name across nodes and the pending tray, and lists workloads', () => {
    for (const view of views(traceSteps(simulate(scenario()), options))) {
      const names = [...view.nodes.flatMap((n) => n.pods.map((p) => p.name)), ...view.pending.map((p) => p.name)];
      expect(new Set(names).size).toBe(names.length);
    }
    const last = views(traceSteps(simulate(scenario()), options)).at(-1)!;
    expect(last.objects.map((o) => [o.kind, o.desired, o.current, o.ready])).toEqual([
      ['Deployment', 3, 3, 3],
      ['ReplicaSet', 3, 3, 3],
    ]);
    expect(last.controlPlane.map((c) => c.id)).toEqual(['api-server', 'etcd', 'scheduler', 'controllers']);
    expect(last.nodes.map((n) => n.cpu)).toEqual(Array.from({ length: 3 }, () => ({ used: 1, capacity: 4 })));
  });

  it('shows a down component as down', () => {
    const steps = traceSteps(simulate(scenario({ faults: [{ kind: 'down', component: 'scheduler', from: 0, to: 30 }] })), options);
    const view = views(steps).find((v) => v.pending.length === 3)!;
    expect(view.controlPlane.find((c) => c.id === 'scheduler')).toMatchObject({ role: 'discarded', badge: 'down' });
  });
});
