import { readChoice, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Action, Scenario, Taint } from '../model';
import { deployment, nodes, scenarioSteps } from './shared';

export const taintsTolerationsCode = `// scheduler: a taint repels pods that don't tolerate it
if (node.taints.some((t) => t.effect !== 'PreferNoSchedule' && !tolerates(pod, t)))
  skip(node)                              // "untolerated taint"

// taint manager: NoExecute also removes pods on the node,
// whether they were there first or placed after the taint
for (const pod of podsOn(node))
  if (!tolerates(pod, taint)) evict(pod)
  else if (toleration.seconds) evictAfter(pod, toleration.seconds)`;

export const SWITCH = ['off', 'on'];
export const EFFECTS = ['NoSchedule', 'NoExecute'];
export const SECONDS = ['none', '10'];
const NO_EXECUTE_AT = 20;

export function taintsTolerationsScenario(values: Record<string, string>): Read<Scenario> {
  const toleration = readChoice(values, 'toleration', 'Toleration', SWITCH);
  if (!toleration.ok) return toleration;
  const effect = readChoice(values, 'effect', 'Taint effect', EFFECTS);
  if (!effect.ok) return effect;
  const seconds = readChoice(values, 'seconds', 'tolerationSeconds', SECONDS);
  if (!seconds.ok) return seconds;
  const taint: Taint = { key: 'gpu', value: 'true', effect: effect.value as Taint['effect'] };
  const noExecute = taint.effect === 'NoExecute';
  const d = deployment('web', 3);
  const tolerations =
    toleration.value === 'on' ? [{ key: 'gpu', operator: 'Equal' as const, value: 'true', effect: taint.effect, ...(noExecute && seconds.value !== 'none' && { seconds: Number(seconds.value) }) }] : undefined;
  const actions: Action[] = [
    // NoSchedule is there from the start; NoExecute arrives once the pods are running.
    { at: noExecute ? NO_EXECUTE_AT : 0, kind: 'taint', node: 'node-3', taint },
    { at: 0, kind: 'apply', object: { ...d, template: { ...d.template, ...(tolerations && { tolerations }) } } },
  ];
  // A timed toleration never settles: each replacement may land on node-3 again and is evicted 10 s later.
  const timed = noExecute && toleration.value === 'on' && seconds.value !== 'none';
  return { ok: true, value: { nodes: nodes(3), actions, faults: [], ...(timed && { until: 60 }) } };
}

export function taintsTolerationsSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(taintsTolerationsScenario(values), "Can't apply this taint", {
    code: taintsTolerationsCode,
    lines: { bind: 'if (node.taints', unschedulable: 'skip(node)', taint: 'for (const pod of podsOn', evict: 'evict(pod)' },
    explain: (event, state) => {
      if (event.kind === 'taint') {
        return event.text.includes('NoExecute')
          ? { why: 'NoExecute is the strong effect: it keeps new pods off and also removes pods already running there that don\'t tolerate it.' }
          : { why: 'A NoSchedule taint marks the node as off-limits for new pods unless they tolerate it, for example a node with an expensive GPU kept for the pods that need it.' };
      }
      if (event.kind === 'evict') {
        const delayed = state.t > NO_EXECUTE_AT;
        return { line: delayed ? 'evictAfter' : 'evict(pod)', why: delayed ? 'The pod tolerated the taint, but only for tolerationSeconds (10 s) from when it was on the tainted node. Time is up, so it is evicted. Its replacement tolerates the taint too, so it can land here again and go round the same loop.' : 'The pod doesn\'t tolerate the new NoExecute taint, so the taint manager evicts it at once. Its ReplicaSet makes a replacement, which the taint keeps off this node.' };
      }
      if (event.kind === 'bind') return { why: 'The tainted node is ruled out for pods without a matching toleration. A toleration only lifts that rule: the pod still goes wherever it scores best.' };
      return undefined;
    },
  });
}
