import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Action, Scenario } from '../model';
import type { Step } from '../../types/visualization';
import { deployment, scenarioSteps } from './shared';

export const clusterAutoscalerCode = `// Cluster Autoscaler, every scan (5 s here; 10 s in Kubernetes)
if (pending.some(fitsEmptyPoolNode) && freeRoom < pendingRequests)
  if (pool.size < max) addNode()          // boots in 20 s here
  else note('max node group size reached')
for (const node of pool)
  if (requested(node) < 50% for 60 s && podsFitElsewhere(node) && pool.size > min)
    drain(node), then deleteNode(node)    // 10 minutes idle in Kubernetes`;

export const BACK = ['off', 'on'];

export function clusterAutoscalerScenario(values: Record<string, string>): Read<Scenario> {
  const replicas = readInt(values, 'replicas', 'Scale to', { min: 2, max: 14 });
  if (!replicas.ok) return replicas;
  const max = readInt(values, 'max', 'Pool max', { min: 2, max: 4 });
  if (!max.ok) return max;
  const back = readChoice(values, 'back', 'Scale back to 2 at 80 s', BACK);
  if (!back.ok) return back;
  const actions: Action[] = [
    { at: 0, kind: 'apply', object: deployment('web', 2) },
    { at: 10, kind: 'scale', target: 'web', replicas: replicas.value },
    ...(back.value === 'on' ? [{ at: 80, kind: 'scale' as const, target: 'web', replicas: 2 }] : []),
  ];
  return { ok: true, value: { nodes: [], actions, faults: [], pool: { cpu: 4, memory: 8192, min: 1, max: max.value }, until: back.value === 'on' ? 260 : 120, runToEnd: true } };
}

export function clusterAutoscalerSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(clusterAutoscalerScenario(values), "Can't run this node pool", {
    code: clusterAutoscalerCode,
    focus: 'web',
    lines: { 'node-add': 'addNode()', 'node-remove': 'drain(node)', unschedulable: 'pending.some', evict: 'drain(node)' },
    explain: (event) => {
      if (event.kind === 'node-add' && event.text.includes('booted')) return { why: 'The new node has started and joined the cluster. The scheduler can now bind the waiting pods to it.' };
      if (event.kind === 'node-add' && event.text.includes('max')) return { line: "note('max node group size reached')", why: 'The pool is at its maximum size, so the autoscaler can\'t add another node. The remaining pods stay Pending until room appears.' };
      if (event.kind === 'unschedulable') return { why: 'No node has room for this pod. That is the signal the Cluster Autoscaler watches for: a Pending pod that a new node would fit.' };
      if (event.kind === 'node-remove' && event.text.includes('is empty')) return { line: 'deleteNode', why: 'All its pods were evicted and now run elsewhere, so the empty node is removed and stops costing money.' };
      return undefined;
    },
  });
}
