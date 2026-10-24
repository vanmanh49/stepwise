import { describe, expect, it } from 'vitest';
import { resolveAmount, type Deployment, type Pod } from './model';
import { Store } from './store';

const pod = (name: string): Pod => ({
  kind: 'Pod',
  name,
  labels: { app: 'web' },
  phase: 'Pending',
  ready: false,
  restarts: 0,
  image: 'app:v1',
  cpu: 1,
  restartPolicy: 'Always',
  createdAt: 0,
});

const deployment = (maxSurge: Deployment['maxSurge'], maxUnavailable: Deployment['maxUnavailable']): Deployment => ({
  kind: 'Deployment',
  name: 'web',
  replicas: 2,
  selector: [{ key: 'app', op: '=', values: ['web'] }],
  template: { labels: { app: 'web' }, image: 'app:v1', cpu: 1, restartPolicy: 'Always' },
  maxSurge,
  maxUnavailable,
  revision: 1,
  history: [],
});

describe('Store', () => {
  it('bumps the version once per accepted write', () => {
    const store = new Store();
    expect(store.write({ op: 'create', object: pod('web-abc') })).toEqual({ ok: true, version: 1 });
    expect(store.write({ op: 'update', object: { ...pod('web-abc'), ready: true } })).toEqual({ ok: true, version: 2 });
    expect(store.version).toBe(2);
    expect(store.get('Pod', 'web-abc')?.ready).toBe(true);
  });

  it('lists objects of a kind in name order', () => {
    const store = new Store();
    for (const name of ['web-c', 'web-a', 'web-b']) store.write({ op: 'create', object: pod(name) });
    expect(store.list('Pod').map((p) => p.name)).toEqual(['web-a', 'web-b', 'web-c']);
    expect(store.list('Service')).toEqual([]);
  });

  it('refuses every write while etcd is down', () => {
    const store = new Store();
    store.write({ op: 'create', object: pod('web-abc') });
    store.etcdUp = false;
    expect(store.write({ op: 'create', object: pod('web-def') })).toEqual({ ok: false, reason: "etcd is down, so the API server can't store anything" });
    expect(store.write({ op: 'delete', object: pod('web-abc') }).ok).toBe(false);
    expect(store.version).toBe(1);
    expect(store.list('Pod').map((p) => p.name)).toEqual(['web-abc']);
  });

  it('refuses duplicates and missing objects', () => {
    const store = new Store();
    store.write({ op: 'create', object: pod('web-abc') });
    expect(store.write({ op: 'create', object: pod('web-abc') })).toEqual({ ok: false, reason: 'Pod web-abc already exists' });
    expect(store.write({ op: 'delete', object: pod('nope') })).toEqual({ ok: false, reason: 'Pod nope not found' });
    expect(store.write({ op: 'update', object: pod('nope') })).toEqual({ ok: false, reason: 'Pod nope not found' });
  });

  it('deletes objects', () => {
    const store = new Store();
    store.write({ op: 'create', object: pod('web-abc') });
    expect(store.write({ op: 'delete', object: pod('web-abc') })).toEqual({ ok: true, version: 2 });
    expect(store.get('Pod', 'web-abc')).toBeUndefined();
  });

  it('refuses a Deployment whose maxSurge and maxUnavailable are both 0', () => {
    const store = new Store();
    const why = "maxSurge and maxUnavailable can't both be 0: the rollout could never start";
    expect(store.write({ op: 'create', object: deployment(0, 0) })).toEqual({ ok: false, reason: why });
    // 25% of 2 replicas rounds down to 0 for maxUnavailable.
    expect(store.write({ op: 'create', object: deployment(0, '25%') })).toEqual({ ok: false, reason: why });
    expect(store.write({ op: 'create', object: deployment('25%', '25%') }).ok).toBe(true);
  });

  it("keeps stored objects apart from the caller's", () => {
    const store = new Store();
    const object = pod('web-abc');
    store.write({ op: 'create', object });
    object.ready = true;
    object.labels.app = 'api';
    expect(store.get('Pod', 'web-abc')).toMatchObject({ ready: false, labels: { app: 'web' } });
  });

  it('snapshots every kind apart from the store', () => {
    const store = new Store();
    store.write({ op: 'create', object: pod('web-abc') });
    const snap = store.snapshot();
    expect(snap.pods.map((p) => p.name)).toEqual(['web-abc']);
    expect(snap).toMatchObject({ nodes: [], replicaSets: [], deployments: [], services: [], endpoints: [] });
    snap.pods[0]!.ready = true;
    expect(store.get('Pod', 'web-abc')?.ready).toBe(false);
  });
});

describe('resolveAmount', () => {
  it('rounds percentages the way Kubernetes does', () => {
    expect(resolveAmount('25%', 4, 'up')).toBe(1);
    expect(resolveAmount('25%', 2, 'up')).toBe(1);
    expect(resolveAmount('25%', 2, 'down')).toBe(0);
    expect(resolveAmount('25%', 6, 'down')).toBe(1);
    expect(resolveAmount(1, 9, 'down')).toBe(1);
  });
});
