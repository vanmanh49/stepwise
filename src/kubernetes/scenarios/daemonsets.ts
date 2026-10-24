import { readChoice, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Action, DaemonSet, Scenario } from '../model';
import { appSelector, appTemplate, deployment, scenarioSteps } from './shared';

export const daemonsetsCode = `// DaemonSet controller, on every node or pod change
for (const node of nodes) {
  const fits = matches(nodeSelector, node.labels) && toleratesTaints(node)
  if (fits && !podOn(node)) createPod(pinnedTo(node))  // the scheduler binds it
  if (!fits && podOn(node)) deletePod(podOn(node))
}
// pods get tolerations for unschedulable and not-ready nodes,
// so cordons and drains leave them alone (--ignore-daemonsets)
// update: replace one node's pod at a time (maxUnavailable 1)`;

export const ON_OFF = ['off', 'on'];
export const NODE_SELECTORS = ['none', 'disk=ssd'];

export function daemonsetsScenario(values: Record<string, string>): Read<Scenario> {
  const toleration = readChoice(values, 'toleration', 'Tolerate gpu taint', ON_OFF);
  if (!toleration.ok) return toleration;
  const nodeSelector = readChoice(values, 'nodeSelector', 'nodeSelector', NODE_SELECTORS);
  if (!nodeSelector.ok) return nodeSelector;
  const join = readChoice(values, 'join', 'node-4 joins at 30 s', ON_OFF);
  if (!join.ok) return join;
  const drain = readChoice(values, 'drain', 'Drain node-1 at 50 s', ON_OFF);
  if (!drain.ok) return drain;
  const update = readChoice(values, 'update', 'New image at 70 s', ON_OFF);
  if (!update.ok) return update;
  const agent: DaemonSet = {
    kind: 'DaemonSet',
    name: 'log-agent',
    selector: appSelector('log-agent'),
    template: { ...appTemplate('log-agent', 'log-agent:v1', 0.5), ...(toleration.value === 'on' && { tolerations: [{ key: 'gpu', operator: 'Exists', effect: 'NoSchedule' }] }) },
    ...(nodeSelector.value !== 'none' && { nodeSelector: { disk: 'ssd' } }),
    revision: 1,
    history: [],
  };
  const actions: Action[] = [
    { at: 0, kind: 'apply', object: agent },
    { at: 0, kind: 'apply', object: deployment('web', 3) },
    ...(join.value === 'on' ? [{ at: 30, kind: 'add-node' as const, node: { name: 'node-4', cpu: 4, labels: { disk: 'ssd' } } }] : []),
    ...(drain.value === 'on' ? [{ at: 50, kind: 'drain' as const, node: 'node-1' }] : []),
    ...(update.value === 'on' ? [{ at: 70, kind: 'set-image' as const, target: 'log-agent', image: 'log-agent:v2' }] : []),
  ];
  const nodes: Scenario['nodes'] = [
    { name: 'node-1', cpu: 4, labels: { disk: 'ssd' } },
    { name: 'node-2', cpu: 4, labels: { disk: 'hdd' } },
    { name: 'node-3', cpu: 4, labels: { disk: 'ssd' }, taints: [{ key: 'gpu', value: 'true', effect: 'NoSchedule' }] },
  ];
  return { ok: true, value: { nodes, actions, faults: [], until: 110, runToEnd: true } };
}

export function daemonsetsSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(daemonsetsScenario(values), "Can't run this DaemonSet", {
    code: daemonsetsCode,
    focus: 'web',
    lines: { 'create-pod': 'createPod(pinnedTo(node))', 'delete-pod': 'deletePod(podOn(node))', 'node-join': 'for (const node of nodes)', cordon: 'so cordons and drains', evict: 'so cordons and drains' },
    explain: (event, state) => {
      const daemon = state.pods.find((p) => p.name === event.subjects[0])?.ownerKind === 'DaemonSet' || event.subjects[1] === 'log-agent';
      if (event.kind === 'create-pod' && daemon) return { why: 'The DaemonSet wants exactly one pod on each node it fits. It pins the new pod to its node with node affinity, and the scheduler binds it there.' };
      if (event.kind === 'create-pod') return { line: 'for (const node of nodes)', why: 'An ordinary ReplicaSet pod for the web app: the scheduler can place it on any node with room.' };
      if (event.kind === 'delete-pod' && event.text.includes('one node at a time')) return { line: 'update: replace', why: 'A DaemonSet update replaces one node\'s pod at a time and waits for the new one to be ready, so only one node is without its agent at any moment.' };
      if (event.kind === 'node-join') return { why: 'A new node has joined. The DaemonSet controller watches nodes, so it gives node-4 its own agent straight away. Nobody has to scale anything.' };
      if (event.kind === 'cordon') return { why: 'kubectl drain cordons node-1 and evicts its pods, but skips DaemonSet pods (real drain needs --ignore-daemonsets for that). The agent tolerates the cordon, so it stays.' };
      return undefined;
    },
  });
}
