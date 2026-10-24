import { readChoice, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Action, PodDisruptionBudget, Scenario } from '../model';
import { appSelector, deployment, nodes, scenarioSteps, service } from './shared';

export const drainingPdbCode = `// kubectl drain node-1
cordon(node)                              // no new pods here
for (const pod of podsOn(node))
  evict(pod)                              // through the eviction API

// eviction API
const allowed = readyPods(pdb.selector) - pdb.minAvailable
if (allowed < 1) refuse(pod)              // drain retries every 5 s
else deletePod(pod)                       // its ReplicaSet replaces it elsewhere`;

export const PDBS = ['none', 'minAvailable 3', 'maxUnavailable 1', 'minAvailable 4'];
export const UNCORDON = ['off', 'on'];
const DRAIN_AT = 21;

export function drainingPdbScenario(values: Record<string, string>): Read<Scenario> {
  const pdb = readChoice(values, 'pdb', 'PodDisruptionBudget', PDBS);
  if (!pdb.ok) return pdb;
  const uncordon = readChoice(values, 'uncordon', 'Uncordon at 60 s', UNCORDON);
  if (!uncordon.ok) return uncordon;
  const [rule, count] = pdb.value.split(' ');
  const budget: PodDisruptionBudget | undefined = rule === 'none' ? undefined : { kind: 'PodDisruptionBudget', name: 'web', selector: appSelector('web'), [rule!]: Number(count) };
  const requests: Action[] = Array.from({ length: 20 }, (_, i) => ({ at: 12 + 2 * i, kind: 'request', id: `#${i + 1}`, service: 'web' }));
  const actions: Action[] = [
    { at: 0, kind: 'apply', object: deployment('web', 4) },
    { at: 0, kind: 'apply', object: service('web') },
    ...(budget ? [{ at: 0, kind: 'apply' as const, object: budget }] : []),
    { at: DRAIN_AT, kind: 'drain', node: 'node-1' },
    ...(uncordon.value === 'on' ? [{ at: 60, kind: 'uncordon' as const, node: 'node-1' }] : []),
    ...requests,
  ];
  return { ok: true, value: { nodes: nodes(3), actions, faults: [], until: 90 } };
}

export function drainingPdbSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(drainingPdbScenario(values), "Can't drain this node", {
    code: drainingPdbCode,
    focus: 'web',
    lines: { cordon: 'cordon(node)', evict: 'deletePod(pod)', 'evict-refused': 'refuse(pod)' },
    explain: (event, state) => {
      if (event.kind === 'evict') {
        return state.pdbs.length === 0
          ? { why: 'With no PodDisruptionBudget, nothing limits how many pods can go at once: both pods on node-1 are evicted together, and only 2 of 4 stay ready until the replacements start.' }
          : { why: 'The budget can spare a pod, so the eviction API lets this one go. Its ReplicaSet starts a replacement on another node.' };
      }
      if (event.kind === 'evict-refused') return { why: 'Evicting this pod now would leave fewer ready pods than the budget requires. The drain keeps retrying every 5 s; once a replacement is ready, the budget allows it.' };
      if (event.kind === 'cordon' && event.text.includes('uncordons')) return { line: 'cordon(node)', why: 'Uncordoning lets the node take new pods again. Pods already running elsewhere stay where they are: nothing moves them back.' };
      return undefined;
    },
  });
}
