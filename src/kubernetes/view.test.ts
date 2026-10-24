import { describe, expect, it } from 'vitest';
import type { ClusterView } from '../types/visualization';
import { deploymentOf, nodesOf } from './fixtures.testutil';
import type { Deployment, Scenario } from './model';
import { simulate } from './sim';
import { traceSteps } from './steps';

const options = { code: 'line one', lines: {} };
const views = (s: Scenario) => traceSteps(simulate(s), options).map((step) => ({ title: step.title, view: step.view as ClusterView }));
const loaded = (d: Deployment): Deployment => ({ ...d, template: { ...d.template, cpu: 0.1, resources: { cpu: { request: 100, limit: 150 }, memory: { request: 64, limit: 64 } } } });

describe('phase 2 cluster view', () => {
  it('keeps two ReplicaSets creating pods in the same second as separate steps', () => {
    const titles = views({ nodes: nodesOf(2), actions: [{ at: 0, kind: 'apply', object: deploymentOf('api', 2) }, { at: 0, kind: 'apply', object: deploymentOf('web', 2) }], faults: [] }).map((v) => v.title);
    expect(titles.filter((t) => / creates 2 pods: /.test(t))).toHaveLength(2);
  });

  it('shows the scheduler\'s scoring table on a bind', () => {
    const bind = views({ nodes: [{ name: 'node-1', cpu: 4 }, { name: 'node-2', cpu: 4, taints: [{ key: 'gpu', value: 'true', effect: 'NoSchedule' }] }], actions: [{ at: 0, kind: 'apply', object: deploymentOf('web', 1) }], faults: [] }).find((v) => v.title.startsWith('scheduler binds'))!;
    expect(bind.view.scoring).toEqual({
      pod: expect.stringMatching(/^web-/),
      rows: [
        { node: 'node-1', scores: { NodeResourcesFit: 88 }, total: 88, chosen: true, role: 'found' },
        { node: 'node-2', filtered: 'node(s) had untolerated taint {gpu: true}', role: 'discarded' },
      ],
    });
    expect(bind.view.nodes.find((n) => n.name === 'node-2')!.taints).toEqual(['gpu=true:NoSchedule']);
  });

  it('shows traffic, pod CPU, QoS and HPA rows under load', () => {
    const hpa = { kind: 'HorizontalPodAutoscaler' as const, name: 'web', target: 'web', min: 1, max: 4, targetCpuPercent: 50 };
    const all = views({
      nodes: nodesOf(2),
      actions: [{ at: 0, kind: 'apply', object: loaded(deploymentOf('web', 1)) }, { at: 0, kind: 'apply', object: hpa }],
      faults: [],
      load: { target: 'web', points: [[0, 20]], cpuPerRequest: 10 },
      until: 40,
      runToEnd: true,
    });
    const end = all.at(-1)!.view;
    expect(end.traffic).toMatchObject({ rps: 20 });
    const pod = end.nodes.flatMap((n) => n.pods)[0]!;
    expect(pod).toMatchObject({ qos: 'Burstable', cpu: { request: 100, limit: 150 } });
    expect(end.objects.find((o) => o.kind === 'HorizontalPodAutoscaler')).toMatchObject({ name: 'web', note: expect.stringMatching(/^CPU \d+% \/ 50%, 1–4 replicas$/) });
    expect(all.find((v) => v.view.nodes.some((n) => n.pods.some((p) => p.note === 'throttled')))).toBeDefined();
  });

  it('shows a PDB row with its allowed disruptions, and a cordoned node', () => {
    const pdb = { kind: 'PodDisruptionBudget' as const, name: 'web', selector: [{ key: 'app', op: '=' as const, values: ['web'] }], minAvailable: 1 };
    const end = views({ nodes: nodesOf(2), actions: [{ at: 0, kind: 'apply', object: deploymentOf('web', 2) }, { at: 0, kind: 'apply', object: pdb }, { at: 20, kind: 'cordon', node: 'node-2' }], faults: [] }).at(-1)!.view;
    expect(end.objects.find((o) => o.kind === 'PodDisruptionBudget')).toMatchObject({ note: 'minAvailable 1, allowed disruptions: 1' });
    expect(end.nodes.find((n) => n.name === 'node-2')!.cordoned).toBe(true);
  });

  it('marks pending pods as waiting for a node while the autoscaler boots one', () => {
    const all = views({ nodes: [], actions: [{ at: 0, kind: 'apply', object: deploymentOf('web', 6) }], faults: [], pool: { cpu: 4, memory: 8192, min: 1, max: 2 }, until: 60, runToEnd: true });
    const booting = all.find((v) => v.view.nodes.some((n) => n.booting))!;
    expect(booting.view.pending.every((p) => p.badge === 'waiting for a node')).toBe(true);
  });

  it('adds no phase 2 parts to a phase 1 run', () => {
    const end = views({ nodes: nodesOf(1), actions: [{ at: 0, kind: 'apply', object: deploymentOf('web', 1) }], faults: [] }).at(-1)!.view;
    expect(end.traffic).toBeUndefined();
    expect(end.nodes[0]).not.toHaveProperty('memory');
    expect(end.nodes[0]!.pods[0]).not.toHaveProperty('cpu');
  });
});
