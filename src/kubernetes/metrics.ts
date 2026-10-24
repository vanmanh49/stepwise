import type { Env } from './env';
import type { Termination } from './kubelet';
import { BASE_MEMORY_MI, cpuRequestM, loadAt, memoryRequestMi, NODE_MEMORY_MI, qosOf, type Pod, type Scenario } from './model';

export interface MetricsHooks {
  startedAt(pod: string): number | undefined;
  kill(pod: string, end: Termination): void;
  /** Requests per second at each tick, recorded before the tick is narrated. */
  traffic: number[];
}

const running = (p: Pod) => p.phase === 'Running';

/** Order in which the kubelet evicts under memory pressure: BestEffort, then Burstable over its request, then the rest; biggest first. */
function pressureRank(p: Pod): number {
  const qos = qosOf(p.resources);
  if (qos === 'BestEffort') return 0;
  if (qos === 'Burstable' && (p.memoryUsage ?? 0) > memoryRequestMi(p)) return 1;
  return 2;
}

/**
 * One metrics tick: each running pod's CPU (its share of the traffic, capped at its limit) and memory (a base
 * plus any leak); OOMKills past a memory limit; one eviction per node out of memory; and a summary for the load target.
 */
export function metricsTick(env: Env, scenario: Scenario, hooks: MetricsHooks): void {
  const now = env.now();
  const load = scenario.load;
  const rps = load ? Math.round(loadAt(load.points, now)) : 0;
  const owners = new Set(load ? env.store.list('ReplicaSet').filter((rs) => rs.owner === load.target).map((rs) => rs.name) : []);
  const serving = env.store.list('Pod').filter((p) => running(p) && p.ready && p.owner && owners.has(p.owner));
  const share = serving.length > 0 ? rps / serving.length : 0;

  for (const pod of env.store.list('Pod').filter(running)) {
    const wanted = serving.some((p) => p.name === pod.name) ? share * load!.cpuPerRequest : 0;
    const limit = pod.resources?.cpu?.limit;
    const cpuUsage = Math.round(limit === undefined ? wanted : Math.min(wanted, limit));
    const throttled = limit !== undefined && wanted > limit;
    const leak = scenario.faults.find((f) => f.kind === 'leak' && pod.name.startsWith(f.prefix));
    const since = hooks.startedAt(pod.name) ?? now;
    const memoryUsage = Math.round(BASE_MEMORY_MI + (leak?.kind === 'leak' ? leak.miPerS * (now - since) : 0));
    // Usage changes wake no controller and aren't narrated one by one.
    env.store.write({ op: 'update', object: { ...pod, cpuUsage, memoryUsage, throttled } });
    if (throttled && !pod.throttled) {
      env.apply({ event: { kind: 'throttle', by: 'kubelet', node: pod.node!, subjects: [pod.name], text: `${pod.name} wants ${Math.round(wanted)}m CPU but its limit is ${limit}m, so it is throttled` } });
    }
    const memLimit = pod.resources?.memory?.limit;
    if (memLimit !== undefined && memoryUsage > memLimit) {
      hooks.kill(pod.name, { code: 137, cause: 'OOMKilled', kind: 'oom-kill', text: `${pod.name} is OOMKilled: it used ${memoryUsage} MiB, over its ${memLimit} MiB limit (exit code 137)` });
    }
  }

  for (const node of env.store.list('Node')) {
    const pods = env.store.list('Pod').filter((p) => p.node === node.name && running(p));
    const used = pods.reduce((s, p) => s + (p.memoryUsage ?? 0), 0);
    const capacity = node.memory ?? NODE_MEMORY_MI;
    const pressure = used > capacity;
    if (pressure !== !!node.memoryPressure) env.store.write({ op: 'update', object: { ...node, memoryPressure: pressure } });
    if (!pressure) continue;
    const victim = pods.toSorted((a, b) => pressureRank(a) - pressureRank(b) || (b.memoryUsage ?? 0) - (a.memoryUsage ?? 0) || (a.name < b.name ? -1 : 1))[0]!;
    env.apply({
      write: { op: 'delete', object: victim },
      event: { kind: 'evict', by: 'kubelet', node: node.name, subjects: [victim.name], text: `kubelet on ${node.name} evicts ${victim.name} (${qosOf(victim.resources)}) to free memory: the node uses ${used} of ${capacity} MiB` },
    });
  }

  if (!load) return;
  hooks.traffic.push(rps);
  const pods = env.store.list('Pod').filter((p) => running(p) && p.ready && p.owner && owners.has(p.owner));
  const request = pods.reduce((s, p) => s + cpuRequestM(p), 0);
  const usage = pods.reduce((s, p) => s + (p.cpuUsage ?? 0), 0);
  const text =
    pods.length === 0
      ? `metrics: ${load.target} has no ready pods to take ${rps} req/s`
      : `metrics: ${load.target} has ${pods.length} ready pod${pods.length === 1 ? '' : 's'} at ${Math.round((100 * usage) / Math.max(1, request))}% of their CPU request, taking ${rps} req/s`;
  // An unchanged reading is a repeated note, so a steady load is narrated once.
  env.apply({ event: { kind: 'metrics', by: 'kubelet', subjects: [load.target], text } });
}
