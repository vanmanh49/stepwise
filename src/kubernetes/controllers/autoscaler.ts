import type { Env } from '../env';
import { requestEviction } from '../evict';
import { CA_UNNEEDED_S, CA_UTILISATION, cpuRequestM, memoryRequestMi, NODE_BOOT_S, type NodeObj, type Pod, type Scenario } from '../model';
import { matches } from '../selector';

export interface AutoscalerState {
  /** When each pool node first looked unneeded in the current stretch. */
  unneededSince: Map<string, number>;
  /** The node being drained for removal, if any. */
  draining?: string;
  maxNoted: boolean;
}

type Pool = NonNullable<Scenario['pool']>;
const active = (p: Pod) => p.phase !== 'Completed' && p.phase !== 'Failed';

/** Would this pod fit an empty node from the pool? */
function fitsPoolNode(pod: Pod, pool: Pool): boolean {
  const required = pod.affinity?.node?.required;
  return cpuRequestM(pod) <= pool.cpu * 1000 && memoryRequestMi(pod) <= pool.memory && (!required || matches(required, pool.labels ?? {}));
}

const requested = (node: NodeObj, pods: Pod[]) => pods.filter((p) => p.node === node.name && active(p)).reduce((s, p) => s + cpuRequestM(p), 0);

/**
 * One Cluster Autoscaler scan: add a pool node when Pending pods would fit one and the booting nodes can't hold them;
 * remove a pool node that has been under 50% requested for 60 s, draining it through the eviction API first.
 */
export function autoscalerTick(env: Env, pool: Pool, state: AutoscalerState) {
  const now = env.now();
  const nodes = env.store.list('Node');
  const pods = env.store.list('Pod');
  const poolNodes = nodes.filter((n) => n.pool);
  const waiting = pods.filter((p) => !p.node && active(p) && p.reason && fitsPoolNode(p, pool));

  // Scale up: one node per scan, while the room left on pool nodes (booting ones included) can't hold what is waiting.
  const room = poolNodes.filter((n) => !n.unschedulable).reduce((s, n) => s + n.cpu * 1000 - requested(n, pods), 0);
  const needed = waiting.reduce((s, p) => s + cpuRequestM(p), 0);
  if (needed > room) {
    if (poolNodes.length < pool.max) {
      let n = 1;
      while (nodes.some((x) => x.name === `pool-${n}`)) n++;
      const name = `pool-${n}`;
      env.apply({
        write: { op: 'create', object: { kind: 'Node', name, cpu: pool.cpu, memory: pool.memory, ready: true, lastHeartbeat: now, booting: true, pool: true, ...(pool.labels && { labels: pool.labels }) } },
        event: { kind: 'node-add', by: 'controllers', node: name, subjects: [name], text: `Cluster Autoscaler adds ${name} for ${waiting.length} Pending pod${waiting.length === 1 ? '' : 's'}; it boots in ${NODE_BOOT_S} s` },
      });
      env.later(NODE_BOOT_S, { kind: 'boot', node: name });
    } else if (!state.maxNoted) {
      state.maxNoted = true;
      env.apply({ event: { kind: 'node-add', by: 'controllers', subjects: ['pool'], text: `Cluster Autoscaler can't add a node: max node group size reached (${pool.max})` } });
    }
    return;
  }

  // Finish a removal in progress once the node is empty.
  if (state.draining) {
    const node = env.store.get('Node', state.draining);
    if (node && !pods.some((p) => p.node === node.name && active(p))) {
      env.apply({ write: { op: 'delete', object: node }, event: { kind: 'node-remove', by: 'controllers', node: node.name, subjects: [node.name], text: `${node.name} is empty and is deleted` } });
      state.draining = undefined;
      state.unneededSince.delete(node.name);
    }
    return;
  }

  // Scale down: a ready pool node under half requested for long enough, whose pods fit on the other nodes.
  for (const node of poolNodes) {
    if (node.booting || poolNodes.length <= pool.min) break;
    const used = requested(node, pods);
    if (used / (node.cpu * 1000) >= CA_UTILISATION) {
      state.unneededSince.delete(node.name);
      continue;
    }
    const since = state.unneededSince.get(node.name) ?? now;
    state.unneededSince.set(node.name, since);
    if (now - since < CA_UNNEEDED_S) continue;
    const others = nodes.filter((n) => n.name !== node.name && n.ready && !n.booting && !n.unschedulable);
    const elsewhere = others.reduce((s, n) => s + n.cpu * 1000 - requested(n, pods), 0);
    if (used > elsewhere) continue;
    state.draining = node.name;
    env.apply({
      write: { op: 'update', object: { ...node, unschedulable: true } },
      event: { kind: 'node-remove', by: 'controllers', node: node.name, subjects: [node.name], text: `Cluster Autoscaler removes ${node.name}: under ${CA_UTILISATION * 100}% requested for ${CA_UNNEEDED_S} s; it cordons and drains it first` },
    });
    for (const pod of pods.filter((p) => p.node === node.name && active(p))) requestEviction(env, pod, 'controllers');
    return;
  }
}

/** A node the autoscaler added has finished booting. */
export function bootNode(env: Env, name: string) {
  const node = env.store.get('Node', name);
  if (!node?.booting) return;
  const { booting: _, ...ready } = node;
  env.apply({ write: { op: 'update', object: ready }, event: { kind: 'node-add', by: 'controllers', node: name, subjects: [name], text: `${name} has booted and is Ready` } });
}
