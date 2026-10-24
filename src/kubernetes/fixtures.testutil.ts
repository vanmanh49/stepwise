import { seeded } from '../utils/random';
import type { Ctx } from './controllers/types';
import { SEED, type NodeObj, type Obj, type Pod, type ReplicaSet, type Template } from './model';
import { Store } from './store';

export const template = (app = 'web', image = 'app:v1'): Template => ({ labels: { app }, image, cpu: 1, restartPolicy: 'Always' });

export const node = (name: string, extra: Partial<NodeObj> = {}): NodeObj => ({ kind: 'Node', name, cpu: 4, ready: true, lastHeartbeat: 0, ...extra });

export const pod = (name: string, extra: Partial<Pod> = {}): Pod => ({
  kind: 'Pod',
  name,
  labels: { app: 'web' },
  phase: 'Running',
  ready: true,
  restarts: 0,
  image: 'app:v1',
  cpu: 1,
  restartPolicy: 'Always',
  createdAt: 0,
  ...extra,
});

export const replicaSet = (name: string, replicas: number, extra: Partial<ReplicaSet> = {}): ReplicaSet => ({
  kind: 'ReplicaSet',
  name,
  replicas,
  selector: [{ key: 'app', op: '=', values: ['web'] }],
  template: template(),
  revision: 1,
  ...extra,
});

export function storeWith(...objects: Obj[]): Store {
  const store = new Store();
  for (const object of objects) store.write({ op: 'create', object });
  return store;
}

export const ctxFor = (store: Store, now = 10): Ctx => ({ now, store, rng: seeded(SEED) });
