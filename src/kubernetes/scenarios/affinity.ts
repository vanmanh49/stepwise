import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { AntiTerm, Pod, Scenario, Selector } from '../model';
import { appSelector, deployment, scenarioSteps } from './shared';

export const affinityCode = `// filters: required rules rule nodes out
if (required.nodeAffinity && !matches(node.labels, rule)) skip(node)
if (required.podAntiAffinity && matchingPodsOn(node) > 0) skip(node)

// scores: preferred rules only add points
score += matches(node.labels, preferred.rule) ? preferred.weight : 0
score += fewer matching pods on the node ? more : less`;

export const NODE_AFFINITY = ['none', 'required ssd', 'preferred ssd'];
export const ANTI = ['none', 'preferred', 'required'];
/** Two zones, each with an ssd and an hdd node of 2 CPU. */
const NODES = [
  { name: 'node-1', cpu: 2, labels: { zone: 'a', disk: 'ssd' } },
  { name: 'node-2', cpu: 2, labels: { zone: 'a', disk: 'hdd' } },
  { name: 'node-3', cpu: 2, labels: { zone: 'b', disk: 'ssd' } },
  { name: 'node-4', cpu: 2, labels: { zone: 'b', disk: 'hdd' } },
];
const SSD: Selector = [{ key: 'disk', op: '=', values: ['ssd'] }];
const ONE_PER_NODE: AntiTerm = { selector: appSelector('web'), topologyKey: 'kubernetes.io/hostname' };

export function affinityScenario(values: Record<string, string>): Read<Scenario> {
  const node = readChoice(values, 'node', 'Node affinity', NODE_AFFINITY);
  if (!node.ok) return node;
  const anti = readChoice(values, 'anti', 'Pod anti-affinity', ANTI);
  if (!anti.ok) return anti;
  const replicas = readInt(values, 'replicas', 'Replicas', { min: 2, max: 6 });
  if (!replicas.ok) return replicas;
  const affinity: NonNullable<Pod['affinity']> = {
    ...(node.value !== 'none' && { node: node.value === 'required ssd' ? { required: SSD } : { preferred: [{ weight: 100, selector: SSD }] } }),
    ...(anti.value !== 'none' && { podAnti: anti.value === 'required' ? { required: ONE_PER_NODE } : { preferred: [{ weight: 100, term: ONE_PER_NODE }] } }),
  };
  const d = deployment('web', replicas.value);
  return { ok: true, value: { nodes: NODES, actions: [{ at: 0, kind: 'apply', object: { ...d, template: { ...d.template, affinity } } }], faults: [] } };
}

export function affinitySteps(values: Record<string, string>): Step[] {
  return scenarioSteps(affinityScenario(values), "Can't place these pods", {
    code: affinityCode,
    focus: 'web',
    lines: { bind: 'score += matches', unschedulable: 'matchingPodsOn(node) > 0' },
    explain: (event) => {
      if (event.kind === 'unschedulable') {
        return event.reason?.includes('anti-affinity')
          ? { why: 'Required anti-affinity allows one web pod per node, and every node already has one. A required rule is never bent, so the pod waits Pending.' }
          : { line: '!matches(node.labels, rule)', why: 'No node that matches the required affinity has room left, and a required rule is never bent.' };
      }
      return undefined;
    },
  });
}
