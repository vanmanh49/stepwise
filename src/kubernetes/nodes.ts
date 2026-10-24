import type { Env } from './env';
import { EVICT_S, GRACE_S } from './model';

/** Every live node reports in. Heartbeats aren't traced and wake no controller; only a missing one matters. */
export function heartbeat(env: Env) {
  for (const node of env.store.list('Node')) {
    if (!env.offline.has(node.name)) env.store.write({ op: 'update', object: { ...node, lastHeartbeat: env.now() } });
  }
}

/** Node lifecycle: a node silent for longer than the grace period goes NotReady and its pods are Lost. */
export function checkNodes(env: Env) {
  for (const node of env.store.list('Node')) {
    // Kubernetes times the grace period from when it last observed the node, so an outage of its own doesn't count.
    const seen = Math.max(node.lastHeartbeat, env.recoveredAt());
    if (!node.ready || env.now() - seen <= GRACE_S) continue;
    const ok = env.apply({
      write: { op: 'update', object: { ...node, ready: false } },
      event: {
        kind: 'node-not-ready',
        by: 'controllers',
        node: node.name,
        subjects: [node.name],
        text: `${node.name} has sent no heartbeat since ${node.lastHeartbeat} s, longer than the ${GRACE_S} s grace period: it is NotReady`,
      },
    });
    if (!ok) continue;
    for (const pod of env.store.list('Pod')) {
      if (pod.node !== node.name || pod.phase === 'Completed' || pod.phase === 'Failed') continue;
      env.apply({
        write: { op: 'update', object: { ...pod, phase: 'Lost', ready: false } },
        event: { kind: 'lost', by: 'controllers', node: node.name, subjects: [pod.name], text: `${pod.name} on ${node.name} is Lost; it is deleted in ${EVICT_S} s` },
      });
    }
    env.later(EVICT_S, { kind: 'evict', node: node.name });
  }
}

export function evict(env: Env, node: string) {
  for (const pod of env.store.list('Pod')) {
    if (pod.node !== node || pod.phase !== 'Lost') continue;
    env.apply({ write: { op: 'delete', object: pod }, event: { kind: 'delete-pod', by: 'controllers', node, subjects: [pod.name], text: `node lifecycle deletes ${pod.name} from NotReady ${node}` } });
  }
}
