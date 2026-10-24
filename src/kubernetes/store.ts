import { isZero, type Kind, type Obj, type ObjOf, type Snapshot } from './model';

export type Write = { op: 'create' | 'update' | 'delete'; object: Obj };
export type WriteResult = { ok: true; version: number } | { ok: false; reason: string };

/** The API server and etcd behind it: versioned objects by kind and name. Callers never hold stored objects. */
export class Store {
  version = 0;
  etcdUp = true;
  private objects = new Map<string, Obj>();

  get<K extends Kind>(kind: K, name: string): ObjOf<K> | undefined {
    const object = this.objects.get(`${kind}/${name}`);
    return object && (structuredClone(object) as ObjOf<K>);
  }

  /** Every object of a kind, in name order. */
  list<K extends Kind>(kind: K): ObjOf<K>[] {
    return [...this.objects.values()]
      .filter((o): o is ObjOf<K> => o.kind === kind)
      .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((o) => structuredClone(o));
  }

  write({ op, object }: Write): WriteResult {
    if (!this.etcdUp) return { ok: false, reason: "etcd is down, so the API server can't store anything" };
    const key = `${object.kind}/${object.name}`;
    const exists = this.objects.has(key);
    if (op === 'create' && exists) return { ok: false, reason: `${object.kind} ${object.name} already exists` };
    if (op !== 'create' && !exists) return { ok: false, reason: `${object.kind} ${object.name} not found` };
    if (op !== 'delete' && object.kind === 'Deployment') {
      if (isZero(object.maxSurge) && isZero(object.maxUnavailable)) {
        return { ok: false, reason: "maxSurge and maxUnavailable can't both be 0: the rollout could never start" };
      }
    }
    if (op === 'delete') this.objects.delete(key);
    else this.objects.set(key, structuredClone(object));
    return { ok: true, version: ++this.version };
  }

  snapshot(): Omit<Snapshot, 't' | 'down' | 'offline' | 'requests'> {
    return {
      nodes: this.list('Node'),
      pods: this.list('Pod'),
      replicaSets: this.list('ReplicaSet'),
      deployments: this.list('Deployment'),
      services: this.list('Service'),
      endpoints: this.list('Endpoints'),
    };
  }
}
