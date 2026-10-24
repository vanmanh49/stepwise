import { describe, expect, it } from 'vitest';
import { deploymentOf, nodesOf, serviceOf } from './fixtures.testutil';
import type { Frame, Pod, Scenario, TraceKind } from './model';
import { simulate } from './sim';

const kinds = (frames: Frame[], skip: TraceKind[] = ['reconcile']) => frames.map((f) => f.event.kind).filter((k) => !skip.includes(k));
const last = (frames: Frame[]) => frames.at(-1)!.state;
const of = (frames: Frame[], kind: TraceKind) => frames.filter((f) => f.event.kind === kind);

const basic = (extra: Partial<Scenario> = {}): Scenario => ({
  nodes: nodesOf(2),
  actions: [{ at: 0, kind: 'apply', object: deploymentOf('web', 2) }],
  faults: [],
  ...extra,
});

const barePod = (restartPolicy: Pod['restartPolicy']): Pod => ({
  kind: 'Pod',
  name: 'job',
  labels: { app: 'job' },
  phase: 'Pending',
  ready: false,
  restarts: 0,
  image: 'app:v1',
  cpu: 1,
  restartPolicy,
  createdAt: 0,
});

describe('simulate', () => {
  it('runs a Deployment to 2 Running, ready pods', () => {
    const { frames, cutOff } = simulate(basic());
    expect(kinds(frames)).toEqual(['action', 'rollout', 'create-pod', 'create-pod', 'bind', 'bind', 'pull', 'pull', 'start', 'start', 'ready', 'ready']);
    const pods = last(frames).pods;
    expect(pods.map((p) => [p.phase, p.ready])).toEqual([
      ['Running', true],
      ['Running', true],
    ]);
    expect(new Set(pods.map((p) => p.node)).size).toBe(2);
    expect(cutOff).toBe(false);
    // Watch latency 1 s, pull 2 s, start 1 s, ready 2 s.
    expect(of(frames, 'ready')[0]!.event.t).toBe(of(frames, 'pull')[0]!.event.t + 5);
  });

  it('repeats exactly', () => {
    expect(simulate(basic())).toEqual(simulate(basic()));
  });

  it('keeps pods Pending while the scheduler is down, then binds them all at once', () => {
    const { frames } = simulate(basic({ faults: [{ kind: 'down', component: 'scheduler', from: 0, to: 30 }] }));
    const binds = of(frames, 'bind');
    expect(binds).toHaveLength(2);
    expect(binds.every((f) => f.event.t === 30)).toBe(true);
    expect(of(frames, 'component-up')[0]!.event.t).toBe(30);
    expect(of(frames, 'component-down')[0]!.state.down).toEqual(['scheduler']);
    expect(last(frames).pods.every((p) => p.ready)).toBe(true);
  });

  it('refuses the apply while etcd is down and changes nothing', () => {
    const { frames } = simulate({ ...basic({ faults: [{ kind: 'down', component: 'etcd', from: 0, to: 30 }] }), actions: [{ at: 2, kind: 'apply', object: deploymentOf('web', 2) }] });
    expect(of(frames, 'refuse-write')).toHaveLength(1);
    expect(of(frames, 'refuse-write')[0]!.event).toMatchObject({ by: 'kubectl', reason: "etcd is down, so the API server can't store anything" });
    expect(frames.every((f) => f.state.pods.length === 0 && f.state.deployments.length === 0)).toBe(true);
  });

  it('backs off 10, 20, 40, 80 s between restarts', () => {
    const { frames, cutOff, endedAt } = simulate({
      nodes: nodesOf(1),
      actions: [{ at: 0, kind: 'apply', object: barePod('Always') }],
      faults: [{ kind: 'crash', prefix: 'job', afterS: 5, exitCode: 1 }],
      until: 200,
    });
    const exits = of(frames, 'exit').map((f) => f.event.t);
    const restarts = of(frames, 'restart').map((f) => f.event.t);
    expect(restarts.slice(0, 4).map((t, i) => t - exits[i]!)).toEqual([10, 20, 40, 80]);
    expect(of(frames, 'back-off')[0]!.state.pods[0]!.phase).toBe('CrashLoopBackOff');
    // The container has stopped, so the pod no longer shows Running from the exit on.
    expect(of(frames, 'exit')[0]!.state.pods[0]).toMatchObject({ phase: 'CrashLoopBackOff', ready: false });
    expect(last(frames).pods[0]!.restarts).toBe(restarts.length);
    // The loop never ends, so the run stops at until.
    expect(cutOff).toBe(true);
    expect(endedAt).toBe(200);
  });

  it('completes on exit 0 under OnFailure, and fails on exit 1 under Never', () => {
    for (const [policy, exitCode, phase] of [
      ['OnFailure', 0, 'Completed'],
      ['Never', 1, 'Failed'],
    ] as const) {
      const { frames } = simulate({ nodes: nodesOf(1), actions: [{ at: 0, kind: 'apply', object: barePod(policy) }], faults: [{ kind: 'crash', prefix: 'job', afterS: 5, exitCode }] });
      expect(last(frames).pods[0]!.phase).toBe(phase);
      expect(of(frames, 'restart')).toEqual([]);
    }
  });

  it('applies faults first: a node that dies as a pod is bound loses it, and the pod is replaced', () => {
    const { frames } = simulate(basic({ faults: [{ kind: 'node-down', node: 'node-2', at: 3 }] }));
    const bind = of(frames, 'bind').find((f) => f.event.node === 'node-2')!;
    expect(bind.event.t).toBe(3);
    expect(of(frames, 'pull').every((f) => f.event.node === 'node-1')).toBe(true);
    // node-2's last heartbeat was at 0; the first node check more than 20 s later is at 25.
    expect(of(frames, 'node-not-ready')[0]!.event).toMatchObject({ t: 25, node: 'node-2' });
    expect(of(frames, 'lost')[0]!.event.t).toBe(25);
    const evicted = of(frames, 'delete-pod')[0]!;
    expect(evicted.event.t).toBe(35);
    expect(of(frames, 'bind').at(-1)!.event).toMatchObject({ node: 'node-1' });
    expect(last(frames).pods.map((p) => [p.node, p.ready])).toEqual([
      ['node-1', true],
      ['node-1', true],
    ]);
    expect(of(frames, 'fault')[0]!.state.offline).toEqual(['node-2']);
  });

  it('stalls a bad-image rollout and keeps v1 serving', () => {
    const { frames } = simulate({
      nodes: nodesOf(3),
      actions: [
        { at: 0, kind: 'apply', object: deploymentOf('web', 4) },
        { at: 15, kind: 'set-image', target: 'web', image: 'app:v2-typo' },
      ],
      faults: [{ kind: 'bad-image', image: 'app:v2-typo' }],
      until: 120,
    });
    for (const frame of frames.filter((f) => f.event.t >= 15)) {
      expect(frame.state.pods.filter((p) => p.ready && p.image === 'app:v1').length).toBeGreaterThanOrEqual(3);
    }
    const pods = last(frames).pods;
    expect(pods.filter((p) => p.image === 'app:v1' && p.ready)).toHaveLength(3);
    expect(pods.filter((p) => p.image === 'app:v2-typo').map((p) => p.phase)).toEqual(['ImagePullBackOff', 'ImagePullBackOff']);
  });

  it('rolls back to v1', () => {
    const { frames } = simulate({
      nodes: nodesOf(3),
      actions: [
        { at: 0, kind: 'apply', object: deploymentOf('web', 4) },
        { at: 15, kind: 'set-image', target: 'web', image: 'app:v2-typo' },
        { at: 60, kind: 'rollback', target: 'web' },
      ],
      faults: [{ kind: 'bad-image', image: 'app:v2-typo' }],
    });
    const state = last(frames);
    expect(state.pods.map((p) => [p.image, p.ready])).toEqual(Array.from({ length: 4 }, () => ['app:v1', true]));
    expect(state.replicaSets.map((rs) => rs.replicas).toSorted()).toEqual([0, 4]);
  });

  it('scales a Deployment and deletes pods by owner', () => {
    const { frames } = simulate(
      basic({
        actions: [
          { at: 0, kind: 'apply', object: deploymentOf('web', 2) },
          { at: 20, kind: 'scale', target: 'web', replicas: 3 },
        ],
      }),
    );
    expect(last(frames).pods).toHaveLength(3);
  });

  const withService = (service = serviceOf('web')): Scenario => ({
    nodes: nodesOf(2),
    actions: [
      { at: 0, kind: 'apply', object: deploymentOf('web', 3) },
      { at: 0, kind: 'apply', object: service },
      ...Array.from({ length: 10 }, (_, i) => ({ at: 10 + i, kind: 'request' as const, id: `#${i + 1}`, service: 'web' })),
    ],
    faults: [],
  });

  it('routes requests to ready endpoints with the seeded rng', () => {
    const { frames } = simulate(withService());
    const requests = last(frames).requests;
    expect(requests).toHaveLength(10);
    expect(requests.every((r) => r.status === 'ok')).toBe(true);
    const endpoints = last(frames).endpoints[0]!.pods;
    expect(requests.every((r) => endpoints.includes(r.pod!))).toBe(true);
    expect(new Set(requests.map((r) => r.pod)).size).toBeGreaterThan(1);
    expect(of(frames, 'route')).toHaveLength(10);
  });

  it('refuses requests with no endpoints', () => {
    const { frames } = simulate(withService(serviceOf('web', 'wbe')));
    expect(last(frames).requests.map((r) => [r.status, r.reason])).toEqual(Array.from({ length: 10 }, () => ['failed', 'no endpoints for web: connection refused']));
    expect(of(frames, 'request-fail')).toHaveLength(10);
  });

  it('marks a pod not ready without stopping it', () => {
    const scenario = withService();
    scenario.faults = [{ kind: 'not-ready', prefix: 'web-', at: 12 }];
    const { frames } = simulate(scenario);
    const hit = of(frames, 'not-ready')[0]!;
    expect(hit.event.t).toBe(12);
    const name = hit.event.subjects[0]!;
    expect(hit.state.pods.find((p) => p.name === name)).toMatchObject({ phase: 'Running', ready: false });
    // Endpoints drop it one watch later.
    expect(of(frames, 'endpoints').at(-1)!.event.t).toBe(13);
    expect(last(frames).endpoints[0]!.pods).not.toContain(name);
    expect(last(frames).requests.filter((r) => r.pod === name && r.status === 'ok').every((r) => Number(r.id.slice(1)) <= 4)).toBe(true);
  });

  it('notes a reconcile with nothing to do only once while nothing changes', () => {
    const notes = of(simulate(basic()).frames, 'reconcile').map((f) => f.event.text);
    expect(new Set(notes).size).toBe(notes.length);
  });

  it('gives every node a fresh grace period after an etcd outage, instead of marking them all NotReady', () => {
    const { frames } = simulate(
      basic({
        actions: [
          { at: 0, kind: 'apply', object: deploymentOf('web', 2) },
          { at: 50, kind: 'scale', target: 'web', replicas: 3 },
        ],
        faults: [{ kind: 'down', component: 'etcd', from: 12, to: 33 }],
      }),
    );
    expect(of(frames, 'node-not-ready')).toEqual([]);
    expect(last(frames).pods.filter((p) => p.ready)).toHaveLength(3);
  });

  it.each([
    [4, 6],
    [4, 30],
  ])('retries kubelet writes refused while etcd is down (%i–%i s)', (from, to) => {
    const { frames } = simulate(basic({ faults: [{ kind: 'down', component: 'etcd', from, to }] }));
    expect(last(frames).pods.map((p) => [p.phase, p.ready])).toEqual([
      ['Running', true],
      ['Running', true],
    ]);
    // A pod is never ready before it is Running.
    expect(frames.every((f) => f.state.pods.every((p) => !p.ready || p.phase === 'Running'))).toBe(true);
    // Repeated refusals of the same write are narrated once.
    const refusals = of(frames, 'refuse-write').map((f) => `${f.event.by}/${f.event.subjects[0]}`);
    expect(new Set(refusals).size).toBe(refusals.length);
  });

  describe('drain, cordon, taints and PDBs', () => {
    const webPdb = (extra: object) => ({ kind: 'PodDisruptionBudget' as const, name: 'web', selector: [{ key: 'app', op: '=' as const, values: ['web'] }], ...extra });
    const drain = (pdb?: object, until = 120): Scenario => ({
      nodes: nodesOf(3),
      actions: [{ at: 0, kind: 'apply', object: deploymentOf('web', 4) }, ...(pdb ? [{ at: 0, kind: 'apply' as const, object: webPdb(pdb) }] : []), { at: 20, kind: 'drain', node: 'node-1' }],
      faults: [],
      until,
    });
    const ready = (f: Frame) => f.state.pods.filter((p) => p.ready).length;

    it('puts two of four pods on node-1, so the drain has two to evict', () => {
      const before = simulate(drain()).frames.filter((f) => f.event.t < 20).at(-1)!;
      expect(before.state.pods.filter((p) => p.node === 'node-1')).toHaveLength(2);
    });

    it('evicts every pod on the node at once without a PDB', () => {
      const { frames } = simulate(drain());
      expect(of(frames, 'cordon')[0]!.event.t).toBe(20);
      expect(of(frames, 'evict').map((f) => f.event.t)).toEqual([20, 20]);
      expect(Math.min(...frames.filter((f) => f.event.t >= 20).map(ready))).toBe(2);
      expect(last(frames).pods.every((p) => p.node !== 'node-1' && p.ready)).toBe(true);
    });

    it('keeps 3 ready with minAvailable 3: one eviction waits for a replacement', () => {
      const { frames } = simulate(drain({ minAvailable: 3 }));
      expect(frames.filter((f) => f.event.t >= 20).every((f) => ready(f) >= 3)).toBe(true);
      const evicts = of(frames, 'evict').map((f) => f.event.t);
      expect(evicts[0]).toBe(20);
      expect(evicts[1]).toBeGreaterThan(20);
      expect((evicts[1]! - 20) % 5).toBe(0);
      const refused = of(frames, 'evict-refused');
      expect(refused).toHaveLength(1);
      expect(refused[0]!.event.reason).toBe("Cannot evict pod as it would violate the pod's disruption budget");
      expect(last(frames).pods.every((p) => p.node !== 'node-1')).toBe(true);
    });

    it('blocks forever with minAvailable 4, and ends at until with a summary', () => {
      const { frames, cutOff, endedAt } = simulate(drain({ minAvailable: 4 }, 100));
      expect(of(frames, 'evict')).toEqual([]);
      expect(cutOff).toBe(true);
      expect(endedAt).toBe(100);
      expect(last(frames).pods.filter((p) => p.node === 'node-1')).toHaveLength(2);
      expect(last(frames).nodes.find((n) => n.name === 'node-1')!.unschedulable).toBe(true);
    });

    it('cordons and uncordons', () => {
      const { frames } = simulate({
        nodes: nodesOf(2),
        actions: [
          { at: 0, kind: 'apply', object: deploymentOf('web', 1) },
          { at: 10, kind: 'cordon', node: 'node-2' },
          { at: 20, kind: 'scale', target: 'web', replicas: 3 },
          { at: 40, kind: 'uncordon', node: 'node-2' },
          { at: 50, kind: 'scale', target: 'web', replicas: 4 },
        ],
        faults: [],
      });
      const at45 = frames.filter((f) => f.event.t < 45).at(-1)!.state;
      expect(at45.pods.every((p) => p.node === 'node-1')).toBe(true);
      expect(last(frames).pods.some((p) => p.node === 'node-2')).toBe(true);
    });

    it('evicts untolerated pods when a NoExecute taint appears, and tolerated ones after tolerationSeconds', () => {
      const tolerant = { ...deploymentOf('api', 1), template: { ...deploymentOf('api', 1).template, tolerations: [{ key: 'maint', operator: 'Exists' as const, seconds: 10 }] } };
      const forever = { ...deploymentOf('db', 1), template: { ...deploymentOf('db', 1).template, tolerations: [{ key: 'maint', operator: 'Exists' as const }] } };
      const { frames } = simulate({
        nodes: nodesOf(1).concat([{ name: 'node-2', cpu: 4 }]),
        actions: [
          { at: 0, kind: 'cordon', node: 'node-2' },
          { at: 0, kind: 'apply', object: deploymentOf('web', 1) },
          { at: 0, kind: 'apply', object: tolerant },
          { at: 0, kind: 'apply', object: forever },
          { at: 15, kind: 'uncordon', node: 'node-2' },
          { at: 20, kind: 'taint', node: 'node-1', taint: { key: 'maint', value: 'now', effect: 'NoExecute' } },
        ],
        faults: [],
        until: 45,
      });
      const evicted = of(frames, 'evict').map((f) => [f.event.t, f.event.subjects[0]!.split('-')[0]]);
      // api's replacement tolerates the taint, so it can land on node-1 again; its own 10 s start when it is bound.
      const rebound = of(frames, 'bind').find((f) => f.event.t > 30 && f.event.subjects[0]!.startsWith('api'))!;
      expect(rebound.event.node).toBe('node-1');
      expect(evicted).toEqual([
        [20, 'web'],
        [30, 'api'],
        [rebound.event.t + 10, 'api'],
      ]);
      expect(last(frames).pods.find((p) => p.owner?.startsWith('db'))!.node).toBe('node-1');
    });

    it('runs to until when asked, even with only periodic work left', () => {
      const result = simulate({ ...basic(), until: 90, runToEnd: true });
      expect(result.endedAt).toBe(90);
      expect(result.cutOff).toBe(false);
    });
  });

  it('never throws on an empty scenario', () => {
    expect(simulate({ nodes: [], actions: [], faults: [] }).frames).toEqual([]);
  });
});

describe('simulate, phase 3 actions', () => {
  it('rollout restart makes the Deployment roll out a new ReplicaSet', () => {
    const { frames } = simulate(basic({ actions: [...basic().actions, { at: 20, kind: 'rollout-restart', target: 'web' }] }));
    expect(of(frames, 'rollout')).toHaveLength(2);
    const d = last(frames).deployments[0]!;
    expect(d.template.annotations?.restartedAt).toBe('20');
    expect(last(frames).replicaSets).toHaveLength(2);
  });

  it('add-node gives a Pending pod somewhere to go', () => {
    const { frames } = simulate({
      nodes: nodesOf(1, 1),
      actions: [
        { at: 0, kind: 'apply', object: deploymentOf('web', 2) },
        { at: 20, kind: 'add-node', node: { name: 'node-2', cpu: 1 } },
      ],
      faults: [],
    });
    expect(of(frames, 'node-join')).toHaveLength(1);
    expect(last(frames).pods.map((p) => p.node).toSorted()).toEqual(['node-1', 'node-2']);
  });

  it('delete removes any object, and says so when there is none', () => {
    const { frames } = simulate(
      basic({
        actions: [
          { at: 0, kind: 'apply', object: serviceOf('web') },
          { at: 5, kind: 'delete', object: { kind: 'Service', name: 'web' } },
          { at: 6, kind: 'delete', object: { kind: 'Service', name: 'nope' } },
        ],
      }),
    );
    expect(last(frames).services).toEqual([]);
    expect(frames.some((f) => f.event.text.includes('nope') && f.event.text.includes('not found'))).toBe(true);
  });

  it('matches kubernetes.io/hostname in required node affinity', () => {
    const d = deploymentOf('web', 1);
    d.template.affinity = { node: { required: [{ key: 'kubernetes.io/hostname', op: '=', values: ['node-2'] }] } };
    const { frames } = simulate(basic({ actions: [{ at: 0, kind: 'apply', object: d }] }));
    expect(last(frames).pods[0]!.node).toBe('node-2');
  });
});

describe('kubectl taint', () => {
  it('replaces a taint with the same key and effect instead of adding a second', () => {
    const { frames } = simulate(
      basic({
        actions: [
          { at: 0, kind: 'taint', node: 'node-1', taint: { key: 'gpu', value: 'a', effect: 'NoSchedule' } },
          { at: 1, kind: 'taint', node: 'node-1', taint: { key: 'gpu', value: 'b', effect: 'NoSchedule' } },
        ],
      }),
    );
    expect(last(frames).nodes.find((n) => n.name === 'node-1')!.taints).toEqual([{ key: 'gpu', value: 'b', effect: 'NoSchedule' }]);
  });
});
