import { describe, expect, it } from 'vitest';
import { resolveAmount, type CronJob, type Database, type Deployment, type Job, type Pod, type Template } from './model';
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
    expect(store.write({ op: 'create', object: deployment('0%', 0) })).toEqual({ ok: false, reason: why });
    // Only literal zeros are refused: 25% of 2 rounds down to 0, but Kubernetes accepts it.
    expect(store.write({ op: 'create', object: deployment(0, '25%') }).ok).toBe(true);
    expect(store.write({ op: 'update', object: { ...deployment('25%', '25%'), replicas: 0 } }).ok).toBe(true);
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

describe('Store, phase 3 validation', () => {
  const job = (restartPolicy: Template['restartPolicy']): Job => ({
    kind: 'Job',
    name: 'report',
    template: { labels: { app: 'report' }, image: 'report:v1', cpu: 1, restartPolicy },
    completions: 1,
    parallelism: 1,
    backoffLimit: 2,
    status: { active: 0, succeeded: 0, failed: 0, startedAt: 0 },
  });
  const always = 'Unsupported value: "Always": supported values: "OnFailure", "Never"';

  it('refuses a Job whose pods would restart forever', () => {
    expect(new Store().write({ op: 'create', object: job('Always') })).toEqual({ ok: false, reason: always });
    expect(new Store().write({ op: 'create', object: job('Never') }).ok).toBe(true);
  });

  it("refuses a CronJob whose job template has restartPolicy Always", () => {
    const { kind: _k, name: _n, status: _s, ...jobTemplate } = job('Always');
    const cron: CronJob = { kind: 'CronJob', name: 'nightly', schedule: '*/1 * * * *', jobTemplate, concurrencyPolicy: 'Allow', successfulHistory: 3, failedHistory: 1 };
    expect(new Store().write({ op: 'create', object: cron })).toEqual({ ok: false, reason: always });
  });

  it('serves Database only once its CRD exists', () => {
    const store = new Store();
    const db: Database = { kind: 'Database', name: 'db', spec: { replicas: 3, version: 15, backup: true } };
    expect(store.write({ op: 'create', object: db })).toEqual({ ok: false, reason: 'no matches for kind "Database" in version "example.com/v1": ensure CRDs are installed first' });
    store.write({ op: 'create', object: { kind: 'CustomResourceDefinition', name: 'databases.example.com', group: 'example.com', resource: 'Database' } });
    expect(store.write({ op: 'create', object: db }).ok).toBe(true);
    expect(store.snapshot().databases.map((d) => d.name)).toEqual(['db']);
  });
});
