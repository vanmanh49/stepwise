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

  it('shows the last 10 requests and folds earlier ones into a count', () => {
    const s: Scenario = {
      nodes: nodesOf(1),
      actions: [
        { at: 0, kind: 'apply', object: deploymentOf('web', 1) },
        { at: 0, kind: 'apply', object: { kind: 'Service', name: 'web', selector: [{ key: 'app', op: '=', values: ['web'] }] } },
        ...Array.from({ length: 14 }, (_, i) => ({ at: 12 + i, kind: 'request' as const, id: `#${i + 1}`, service: 'web' })),
      ],
      faults: [],
    };
    const end = views(s).at(-1)!.view;
    expect(end.requests!.map((r) => r.id)).toEqual(['#5', '#6', '#7', '#8', '#9', '#10', '#11', '#12', '#13', '#14']);
    expect(end.requestsEarlier).toEqual({ count: 4, ok: 4, failed: 0 });
  });

  it('adds no phase 2 parts to a phase 1 run', () => {
    const end = views({ nodes: nodesOf(1), actions: [{ at: 0, kind: 'apply', object: deploymentOf('web', 1) }], faults: [] }).at(-1)!.view;
    expect(end.traffic).toBeUndefined();
    expect(end.nodes[0]).not.toHaveProperty('memory');
    expect(end.nodes[0]!.pods[0]).not.toHaveProperty('cpu');
  });
});

describe('phase 3 cluster view', () => {
  const app = (name: string) => [{ key: 'app', op: '=' as const, values: [name] }];
  const all = (s: Scenario) => views(s);

  it('shows the Ingress rules with the matched one highlighted, and the request as GET host/path', () => {
    const ingress = { kind: 'Ingress' as const, name: 'shop', rules: [{ host: 'shop.example.com', paths: [{ path: '/', pathType: 'Prefix' as const, service: 'web' }, { path: '/api', pathType: 'Prefix' as const, service: 'api' }] }] };
    const steps = all({
      nodes: nodesOf(2),
      ingressController: true,
      actions: [
        { at: 0, kind: 'apply', object: deploymentOf('api', 1) },
        { at: 0, kind: 'apply', object: { kind: 'Service', name: 'api', selector: app('api') } },
        { at: 0, kind: 'apply', object: ingress },
        { at: 20, kind: 'request', id: '#1', service: '', host: 'shop.example.com', path: '/api' },
      ],
      faults: [],
    });
    const step = steps.find((v) => v.view.rules)!;
    expect(step.view.rules!.rows.map((r) => r.role)).toEqual(['default', 'found']);
    expect(step.view.requests![0]!.label).toBe('GET shop.example.com/api');
    expect(steps.at(-1)!.view.objects.find((o) => o.kind === 'Ingress')!.note).toBe('2 paths');
  });

  it('marks the policy that dropped a request, and labels requests between pods', () => {
    const steps = all({
      nodes: nodesOf(2),
      actions: [
        { at: 0, kind: 'apply', object: deploymentOf('api', 1) },
        { at: 0, kind: 'apply', object: deploymentOf('debug', 1) },
        { at: 0, kind: 'apply', object: { kind: 'Service', name: 'api', selector: app('api') } },
        { at: 0, kind: 'apply', object: { kind: 'NetworkPolicy', name: 'default-deny', podSelector: [], policyTypes: ['Ingress'] } },
        { at: 20, kind: 'request', id: '#1', service: 'api', from: 'debug' },
      ],
      faults: [],
    });
    const drop = steps.find((v) => v.view.rules)!;
    expect(drop.view.rules!.rows).toEqual([{ cells: ['default-deny', 'all pods', 'Ingress', 'nothing'], role: 'discarded' }]);
    expect(drop.view.requests![0]!.label).toBe('debug → api');
  });

  it('shows config, secret, claim and volume rows, and what each pod mounts', () => {
    const d = deploymentOf('db', 1);
    d.template.volumes = [{ name: 'data', claim: 'data' }];
    d.template.env = [{ name: 'color', from: { configMap: 'cfg', key: 'color' } }];
    const end = all({
      nodes: nodesOf(1),
      actions: [
        { at: 0, kind: 'apply', object: { kind: 'ConfigMap', name: 'cfg', data: { color: 'blue' } } },
        { at: 0, kind: 'apply', object: { kind: 'Secret', name: 'db', data: { password: 'secret' } } },
        { at: 0, kind: 'apply', object: { kind: 'PersistentVolume', name: 'pv-1', capacityGi: 2, accessMode: 'ReadWriteOnce', reclaimPolicy: 'Retain', phase: 'Available', records: 0 } },
        { at: 0, kind: 'apply', object: { kind: 'PersistentVolumeClaim', name: 'data', requestGi: 1, accessMode: 'ReadWriteOnce', phase: 'Pending' } },
        { at: 0, kind: 'apply', object: d },
      ],
      faults: [],
      until: 30,
      runToEnd: true,
    }).at(-1)!.view;
    const note = (kind: string) => end.objects.find((o) => o.kind === kind)!.note;
    expect(note('ConfigMap')).toBe('color=blue');
    expect(note('Secret')).toBe('password: c2VjcmV0 (base64, not encrypted)');
    expect(note('PersistentVolumeClaim')).toBe('Bound to pv-1, 1Gi RWO');
    expect(note('PersistentVolume')).toMatch(/^Bound to data, 2Gi RWO, \d+ records, attached to node-1$/);
    const pod = end.nodes[0]!.pods[0]!;
    expect(pod.mounts).toEqual([expect.stringMatching(/^data · \d+ records$/), 'config: color=blue']);
  });

  it('gives StatefulSet pods their DNS names, and narrates a DaemonSet creating pods by its own kind', () => {
    const ds = { kind: 'DaemonSet' as const, name: 'agent', selector: app('agent'), template: { labels: { app: 'agent' }, image: 'a:1', cpu: 1, restartPolicy: 'Always' as const }, revision: 1, history: [] };
    const ss = { kind: 'StatefulSet' as const, name: 'db', replicas: 1, selector: app('db'), template: { labels: { app: 'db' }, image: 'p:1', cpu: 1, restartPolicy: 'Always' as const }, serviceName: 'db', podManagementPolicy: 'OrderedReady' as const, whenScaled: 'Retain' as const, revision: 1, history: [] };
    const steps = all({ nodes: nodesOf(2), actions: [{ at: 0, kind: 'apply', object: ds }, { at: 0, kind: 'apply', object: ss }], faults: [] });
    expect(steps.some((v) => v.title.startsWith('DaemonSet agent creates 2 pods'))).toBe(true);
    const end = steps.at(-1)!.view;
    expect(end.nodes.flatMap((n) => n.pods).find((p) => p.name === 'db-0')!.dns).toBe('db-0.db');
    expect(end.objects.find((o) => o.kind === 'DaemonSet')).toMatchObject({ desired: 2, current: 2, ready: 2 });
    expect(end.objects.find((o) => o.kind === 'StatefulSet')).toMatchObject({ desired: 1, current: 1, ready: 1 });
  });

  it('notes a container restarted by its startup probe as such', () => {
    const d = deploymentOf('web', 1);
    d.template.probes = { startup: { periodS: 2, failureThreshold: 2 } };
    const end = all({ nodes: nodesOf(1), actions: [{ at: 0, kind: 'apply', object: d }], faults: [{ kind: 'slow-start', prefix: 'web', seconds: 30 }], until: 20, runToEnd: true }).at(-1)!.view;
    expect(end.nodes[0]!.pods[0]!.note).toBe('Startup probe failed');
  });
});
