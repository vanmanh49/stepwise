import { describe, expect, it } from 'vitest';
import { ctxFor, storeWith, template } from '../fixtures.testutil';
import { resolveAmount, type Amount, type Deployment } from '../model';
import type { Store } from '../store';
import { reconcileDeployments, rolledBack, withImage } from './deployment';
import { reconcileReplicaSets } from './replicaset';

const deployment = (replicas: number, maxSurge: Amount, maxUnavailable: Amount): Deployment => ({
  kind: 'Deployment',
  name: 'web',
  replicas,
  selector: [{ key: 'app', op: '=', values: ['web'] }],
  template: template(),
  maxSurge,
  maxUnavailable,
  revision: 1,
  history: [],
});

/** Stands in for the scheduler and kubelets: every pod is placed and ready at once, unless its image is bad. */
function settle(store: Store, bad?: string) {
  for (const pod of store.list('Pod')) {
    if (pod.node) continue;
    const ok = pod.image !== bad;
    store.write({ op: 'update', object: { ...pod, node: 'node-1', phase: ok ? 'Running' : 'ImagePullBackOff', ready: ok } });
  }
}

/** Runs the Deployment and ReplicaSet controllers until nothing changes, checking `check` after every write. */
function converge(store: Store, options: { bad?: string; check?: () => void } = {}) {
  for (let round = 0; round < 50; round++) {
    let wrote = false;
    for (const reconcile of [reconcileDeployments, reconcileReplicaSets]) {
      for (const change of reconcile(ctxFor(store, round))) {
        if (!change.write) continue;
        expect(store.write(change.write).ok).toBe(true);
        wrote = true;
        options.check?.();
      }
    }
    settle(store, options.bad);
    options.check?.();
    if (!wrote) return;
  }
  throw new Error('did not converge');
}

const counts = (store: Store) => store.list('ReplicaSet').map((rs) => [rs.template.image, rs.replicas]);
const readyPods = (store: Store, image?: string) => store.list('Pod').filter((p) => p.ready && (!image || p.image === image)).length;

function rollout(replicas: number, maxSurge: Amount, maxUnavailable: Amount, image = 'app:v2', bad?: string) {
  const store = storeWith(deployment(replicas, maxSurge, maxUnavailable));
  converge(store);
  const d = store.get('Deployment', 'web')!;
  store.write({ op: 'update', object: withImage(d, image) });
  const surge = resolveAmount(maxSurge, replicas, 'up');
  const unavailable = resolveAmount(maxUnavailable, replicas, 'down');
  const maxTotal = replicas + surge;
  // Both rounding to 0 means one pod may be unavailable.
  const minReady = replicas - (surge === 0 && unavailable === 0 ? 1 : unavailable);
  converge(store, {
    bad,
    check: () => {
      expect(store.list('Pod').length).toBeLessThanOrEqual(maxTotal);
      expect(readyPods(store)).toBeGreaterThanOrEqual(minReady);
    },
  });
  return store;
}

describe('Deployment controller', () => {
  it('creates one ReplicaSet for a new Deployment and scales it to replicas', () => {
    const store = storeWith(deployment(3, '25%', '25%'));
    const [change, ...rest] = reconcileDeployments(ctxFor(store));
    expect(rest).toEqual([]);
    expect(change!.write!.object).toMatchObject({ kind: 'ReplicaSet', owner: 'web', replicas: 3, revision: 1, template: template() });
    expect(change!.event).toMatchObject({ kind: 'rollout', by: 'controllers' });
    expect(change!.write!.object.name).toMatch(/^web-[a-z0-9]{2}$/);
    converge(store);
    expect(counts(store)).toEqual([['app:v1', 3]]);
    expect(readyPods(store)).toBe(3);
  });

  it.each([
    [4, '25%', '25%'],
    [4, 1, 0],
    [4, 0, 1],
    [2, '25%', '25%'],
  ] as const)('rolls %i replicas out with surge %s and unavailable %s within the bounds', (replicas, surge, unavailable) => {
    const store = rollout(replicas, surge, unavailable);
    expect(counts(store).toSorted()).toEqual([
      ['app:v1', 0],
      ['app:v2', replicas],
    ]);
    expect(readyPods(store, 'app:v2')).toBe(replicas);
  });

  it('stalls when new pods never become ready, keeping old pods serving', () => {
    const store = rollout(4, '25%', '25%', 'app:v2-typo', 'app:v2-typo');
    expect(counts(store).toSorted()).toEqual([
      ['app:v1', 3],
      ['app:v2-typo', 2],
    ]);
    expect(readyPods(store, 'app:v1')).toBe(3);
  });

  it('rolls back to the old ReplicaSet without creating a new one', () => {
    const store = rollout(4, '25%', '25%', 'app:v2-typo', 'app:v2-typo');
    const back = rolledBack(store.get('Deployment', 'web')!)!;
    expect(back).toMatchObject({ template: template(), revision: 3, history: [template('web', 'app:v2-typo')] });
    store.write({ op: 'update', object: back });
    converge(store, { bad: 'app:v2-typo', check: () => expect(readyPods(store)).toBeGreaterThanOrEqual(3) });
    expect(counts(store).toSorted()).toEqual([
      ['app:v1', 4],
      ['app:v2-typo', 0],
    ]);
    expect(readyPods(store, 'app:v1')).toBe(4);
  });

  it("doesn't count a scale-down twice before the ReplicaSet controller carries it out", () => {
    const store = storeWith(deployment(4, '25%', '25%'));
    converge(store);
    store.write({ op: 'update', object: withImage(store.get('Deployment', 'web')!, 'app:v2') });
    // Two Deployment passes in a row, with no pods created or deleted in between.
    for (let pass = 0; pass < 2; pass++) for (const change of reconcileDeployments(ctxFor(store))) store.write(change.write!);
    expect(counts(store).toSorted()).toEqual([
      ['app:v1', 3],
      ['app:v2', 2],
    ]);
  });

  it('rolls out when both percentages round to 0, as if maxUnavailable were 1', () => {
    const store = rollout(2, 0, '25%');
    expect(counts(store).toSorted()).toEqual([
      ['app:v1', 0],
      ['app:v2', 2],
    ]);
  });

  it('has nothing to roll back to without history', () => {
    expect(rolledBack(deployment(2, 1, 0))).toBeUndefined();
  });

  it('scales the current ReplicaSet down when replicas drop', () => {
    const store = storeWith(deployment(4, 1, 0));
    converge(store);
    store.write({ op: 'update', object: { ...store.get('Deployment', 'web')!, replicas: 2 } });
    converge(store);
    expect(counts(store)).toEqual([['app:v1', 2]]);
  });
});
