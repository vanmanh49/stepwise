import { cpuRequestM, memoryRequestMi, NODE_MEMORY_MI, qosOf, tolerates, type AntiTerm, type Breakdown, type NodeObj, type Pod } from '../model';
import { matches } from '../selector';
import type { Change, Reconcile } from './types';

/** Pods that no longer use their node's resources. */
const finished = (p: Pod) => p.phase === 'Completed' || p.phase === 'Failed';
const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

type Row = Breakdown['rows'][number];

/** The topology domain a node is in for an anti-affinity term. */
const domain = (node: NodeObj, term: AntiTerm) => (term.topologyKey === 'zone' ? node.labels?.zone : node.name);

/**
 * Filter, then score, as kube-scheduler does: nodes that can't take the pod are ruled out with the reason
 * Kubernetes gives; the rest are scored by each plugin and the highest total wins, ties to the lowest name.
 */
export const schedule: Reconcile = (ctx) => {
  const changes: Change[] = [];
  const nodes = ctx.store.list('Node');
  // Pods placed in this pass count against their node straight away.
  const pods = ctx.store.list('Pod').filter((p) => !finished(p));
  const bound = new Map(pods.filter((p) => p.node).map((p) => [p.name, p.node!]));
  const unbound = pods.filter((p) => !p.node).toSorted((a, b) => a.createdAt - b.createdAt || byName(a, b));
  const most = ctx.strategy === 'MostAllocated';

  for (const pod of unbound) {
    const on = (node: NodeObj) => pods.filter((p) => bound.get(p.name) === node.name);
    const inDomain = (node: NodeObj, term: AntiTerm) => {
      const d = domain(node, term);
      return pods.filter((p) => p.name !== pod.name && bound.has(p.name) && matches(term.selector, p.labels) && domain(nodes.find((n) => n.name === bound.get(p.name))!, term) === d && d !== undefined).length;
    };
    const filter = (node: NodeObj): string | undefined => {
      if (!node.ready || node.booting) return 'node(s) were not ready';
      if (node.unschedulable) return 'node(s) were unschedulable';
      const taint = (node.taints ?? []).find((t) => t.effect !== 'PreferNoSchedule' && !tolerates(pod.tolerations, t));
      if (taint) return `node(s) had untolerated taint {${taint.key}: ${taint.value}}`;
      if (node.memoryPressure && qosOf(pod.resources) === 'BestEffort') return 'node(s) had memory pressure';
      const required = pod.affinity?.node?.required;
      if (required && !matches(required, node.labels ?? {})) return "node(s) didn't match Pod's node affinity/selector";
      const anti = pod.affinity?.podAnti?.required;
      if (anti && inDomain(node, anti) > 0) return "node(s) didn't match pod anti-affinity rules";
      const here = on(node);
      if (node.cpu * 1000 - here.reduce((s, p) => s + cpuRequestM(p), 0) < cpuRequestM(pod)) return 'Insufficient cpu';
      if ((node.memory ?? NODE_MEMORY_MI) - here.reduce((s, p) => s + memoryRequestMi(p), 0) < memoryRequestMi(pod)) return 'Insufficient memory';
      return undefined;
    };

    const rows: Row[] = nodes.toSorted(byName).map((node) => {
      const filtered = filter(node);
      return filtered ? { node: node.name, filtered } : { node: node.name };
    });
    const passing = nodes.filter((n) => !rows.find((r) => r.node === n.name)!.filtered);
    const preferredNode = pod.affinity?.node?.preferred ?? [];
    const preferredAnti = pod.affinity?.podAnti?.preferred ?? [];
    const anyPreferTaint = nodes.some((n) => (n.taints ?? []).some((t) => t.effect === 'PreferNoSchedule'));
    const maxAnti = Math.max(1, ...preferredAnti.flatMap(({ term }) => passing.map((n) => inDomain(n, term))));

    for (const node of passing) {
      const here = on(node);
      const cpuFree = (node.cpu * 1000 - here.reduce((s, p) => s + cpuRequestM(p), 0) - cpuRequestM(pod)) / (node.cpu * 1000);
      const memCap = node.memory ?? NODE_MEMORY_MI;
      const memFree = (memCap - here.reduce((s, p) => s + memoryRequestMi(p), 0) - memoryRequestMi(pod)) / memCap;
      const least = (cpuFree + memFree) * 50;
      const scores: Record<string, number> = { NodeResourcesFit: Math.round(most ? 100 - least : least) };
      if (preferredNode.length > 0) {
        const total = preferredNode.reduce((s, p) => s + p.weight, 0);
        const hit = preferredNode.filter((p) => matches(p.selector, node.labels ?? {})).reduce((s, p) => s + p.weight, 0);
        scores.NodeAffinity = Math.round((100 * hit) / total);
      }
      if (preferredAnti.length > 0) {
        const total = preferredAnti.reduce((s, p) => s + p.weight, 0);
        scores.PodAntiAffinity = Math.round(preferredAnti.reduce((s, { weight, term }) => s + weight * (1 - inDomain(node, term) / maxAnti), 0) * (100 / total));
      }
      if (anyPreferTaint) {
        const untolerated = (node.taints ?? []).filter((t) => t.effect === 'PreferNoSchedule' && !tolerates(pod.tolerations, t)).length;
        scores.TaintToleration = Math.max(0, 100 - 50 * untolerated);
      }
      const row = rows.find((r) => r.node === node.name)!;
      row.scores = scores;
      row.total = Object.values(scores).reduce((s, v) => s + v, 0);
    }

    const best = rows.filter((r) => r.total !== undefined).toSorted((a, b) => b.total! - a.total! || (a.node < b.node ? -1 : 1))[0];
    if (best) {
      best.chosen = true;
      const target = nodes.find((n) => n.name === best.node)!;
      const free = (target.cpu * 1000 - on(target).reduce((sum, p) => sum + cpuRequestM(p), 0)) / 1000;
      bound.set(pod.name, target.name);
      const { reason: _, ...rest } = pod;
      changes.push({
        write: { op: 'update', object: { ...rest, node: target.name } },
        event: { kind: 'bind', by: 'scheduler', node: target.name, subjects: [pod.name, target.name], text: `scheduler binds ${pod.name} to ${target.name} (${Number(free.toFixed(2))} of ${target.cpu} CPU free)`, breakdown: { pod: pod.name, rows } },
      });
      continue;
    }
    // Reasons grouped and counted in the order the filters run, as kube-scheduler prints them.
    const counts = new Map<string, number>();
    for (const order of ['not ready', 'unschedulable', 'taint', 'memory pressure', 'node affinity', 'anti-affinity', 'Insufficient cpu', 'Insufficient memory']) {
      for (const r of rows) if (r.filtered?.includes(order)) counts.set(r.filtered, (counts.get(r.filtered) ?? 0) + 1);
    }
    const reason = `0/${nodes.length} nodes are available: ${[...counts].map(([text, n]) => `${n} ${text}`).join(', ')}`;
    if (pod.reason === reason) continue;
    changes.push({
      write: { op: 'update', object: { ...pod, reason } },
      event: { kind: 'unschedulable', by: 'scheduler', subjects: [pod.name], text: `scheduler can't place ${pod.name}: ${reason}`, reason, breakdown: { pod: pod.name, rows } },
    });
  }
  return changes;
};
