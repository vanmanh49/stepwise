import type { Env } from './env';
import { EVICT_RETRY_S, tolerates, type Pod, type PodDisruptionBudget, type ReplicaSet, type Taint } from './model';
import { matches } from './selector';
import type { Store } from './store';

const REFUSED = "Cannot evict pod as it would violate the pod's disruption budget";

/**
 * How many more matching pods may be disrupted now: ready pods beyond minAvailable, or maxUnavailable minus those down.
 * "Down" counts against the pods the ReplicaSets expect, so a pod already evicted and not yet replaced still counts.
 */
export function allowedDisruptions(pdb: PodDisruptionBudget, pods: Pod[], replicaSets: ReplicaSet[] = []): number {
  const matching = pods.filter((p) => matches(pdb.selector, p.labels));
  const healthy = matching.filter((p) => p.ready).length;
  const expected = Math.max(matching.length, replicaSets.filter((rs) => matches(pdb.selector, rs.template.labels)).reduce((s, rs) => s + rs.replicas, 0));
  const allowed = pdb.minAvailable !== undefined ? healthy - pdb.minAvailable : (pdb.maxUnavailable ?? 0) - (expected - healthy);
  return Math.max(0, allowed);
}

/** The eviction API's check: a ready pod may go only if every budget that selects it can spare one. */
export function evictionAllowed(store: Store, pod: Pod): { ok: true } | { ok: false; reason: string } {
  if (!pod.ready) return { ok: true };
  const pods = store.list('Pod');
  const replicaSets = store.list('ReplicaSet');
  const blocked = store.list('PodDisruptionBudget').some((pdb) => matches(pdb.selector, pod.labels) && allowedDisruptions(pdb, pods, replicaSets) < 1);
  return blocked ? { ok: false, reason: REFUSED } : { ok: true };
}

/** Pods whose refusal was already narrated, so a retry every 5 s isn't told each time. */
const told = new WeakMap<Env, Set<string>>();

/** Asks the eviction API to evict a pod; a refusal is retried every 5 s. True when the pod was evicted. */
export function requestEviction(env: Env, pod: Pod, by: 'kubectl' | 'controllers'): boolean {
  const check = evictionAllowed(env.store, pod);
  const seen = told.get(env) ?? new Set<string>();
  told.set(env, seen);
  if (!check.ok) {
    if (!seen.has(pod.name)) {
      seen.add(pod.name);
      env.apply({ event: { kind: 'evict-refused', by, node: pod.node!, subjects: [pod.name], text: `Eviction of ${pod.name} is refused: ${check.reason}`, reason: check.reason } });
    }
    env.later(EVICT_RETRY_S, { kind: 'evict-retry', pod: pod.name, by });
    return false;
  }
  seen.delete(pod.name);
  return env.apply({ write: { op: 'delete', object: pod }, event: { kind: 'evict', by, node: pod.node!, subjects: [pod.name], text: `${by === 'kubectl' ? 'kubectl' : 'The eviction API'} evicts ${pod.name} from ${pod.node}` } });
}

/** Pods whose tolerationSeconds countdown has started, so each pod's starts once. */
const counting = new WeakMap<Env, Set<string>>();

/**
 * The taint manager, run when a taint is added and when pods are bound: a NoExecute taint evicts pods that don't
 * tolerate it, and starts the tolerationSeconds countdown for pods that tolerate it for a while, including pods
 * placed on the node after the taint.
 */
export function applyNoExecute(env: Env) {
  const started = counting.get(env) ?? new Set<string>();
  counting.set(env, started);
  for (const node of env.store.list('Node')) {
    for (const taint of (node.taints ?? []).filter((t) => t.effect === 'NoExecute')) {
      for (const pod of env.store.list('Pod')) {
        if (pod.node !== node.name || pod.phase === 'Completed' || pod.phase === 'Failed') continue;
        const toleration = (pod.tolerations ?? []).find((t) => tolerates([t], taint));
        if (toleration && toleration.seconds === undefined) continue;
        if (!toleration) {
          evictForTaint(env, pod, taint);
          continue;
        }
        if (started.has(pod.name)) continue;
        started.add(pod.name);
        env.later(toleration.seconds!, { kind: 'noexecute', pod: pod.name, node: node.name });
      }
    }
  }
}

export function evictForTaint(env: Env, pod: Pod, taint: Pick<Taint, 'key' | 'value'>) {
  env.apply({ write: { op: 'delete', object: pod }, event: { kind: 'evict', by: 'controllers', node: pod.node!, subjects: [pod.name], text: `The taint manager evicts ${pod.name}: ${pod.node} has taint {${taint.key}: ${taint.value}}:NoExecute` } });
}
