import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Action, Scenario } from '../model';
import { appTemplate, pod, scenarioSteps } from './shared';

export const schedulerCode = `// kube-scheduler, for each Pending pod
const feasible = nodes.filter((node) =>
  !node.unschedulable &&               // cordoned?
  toleratesTaints(pod, node) &&
  fits(pod.requests, node.free))       // enough CPU and memory?
if (feasible.length === 0)
  return markUnschedulable(pod, reasons)
const score = (node) => strategy === 'LeastAllocated'
  ? freeAfter(node, pod)               // keep room to spare
  : 100 - freeAfter(node, pod)         // fill nodes up
bind(pod, maxBy(feasible, score))`;

export const STRATEGIES = ['LeastAllocated', 'MostAllocated'];
export const CORDON = ['off', 'on'];
/** Three nodes of different sizes, so the strategies disagree. */
const NODES = [
  { name: 'node-1', cpu: 2, memory: 4096 },
  { name: 'node-2', cpu: 4, memory: 4096 },
  { name: 'node-3', cpu: 3, memory: 4096 },
];

export function schedulerScenario(values: Record<string, string>): Read<Scenario> {
  const strategy = readChoice(values, 'strategy', 'Strategy', STRATEGIES);
  if (!strategy.ok) return strategy;
  const cpu = readInt(values, 'cpu', 'Pod CPU', { min: 1, max: 4 });
  if (!cpu.ok) return cpu;
  const cordon = readChoice(values, 'cordon', 'Cordon node-2', CORDON);
  if (!cordon.ok) return cordon;
  const template = { ...appTemplate('web'), cpu: cpu.value, resources: { cpu: { request: cpu.value * 1000 }, memory: { request: 1024 } } };
  const actions: Action[] = [...(cordon.value === 'on' ? [{ at: 0, kind: 'cordon' as const, node: 'node-2' }] : []), { at: 0, kind: 'apply', object: pod('web', template) }];
  return { ok: true, value: { nodes: NODES, actions, faults: [], schedulerStrategy: strategy.value as Scenario['schedulerStrategy'] } };
}

export function schedulerSteps(values: Record<string, string>): Step[] {
  const strategy = values.strategy === 'MostAllocated' ? 'MostAllocated' : 'LeastAllocated';
  return scenarioSteps(schedulerScenario(values), "Can't schedule this pod", {
    code: schedulerCode,
    lines: { bind: 'bind(pod, maxBy', unschedulable: 'markUnschedulable', cordon: '!node.unschedulable', action: 'const feasible' },
    explain: (event) => {
      if (event.kind === 'bind') {
        return {
          why:
            strategy === 'LeastAllocated'
              ? 'LeastAllocated scores each node by how much CPU and memory it would have left after taking the pod, so pods spread out and every node keeps room for spikes.'
              : 'MostAllocated scores the opposite way: the fuller a node would be, the better. Pods pack onto few nodes, leaving others empty so they can be removed to save money.',
        };
      }
      if (event.kind === 'unschedulable') {
        return { why: 'Every node failed a filter, so there is nothing to score. The pod waits Pending, and the message counts each reason, exactly as kubectl describe pod shows it.' };
      }
      return undefined;
    },
  });
}
