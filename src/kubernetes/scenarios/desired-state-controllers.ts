import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario } from '../model';
import { nodes, replicaSet, scenarioSteps } from './shared';

export const desiredStateControllersCode = `// Every controller runs the same loop
while (true) {
  const desired = read(spec)          // what you asked for
  const actual = observe(cluster)     // what exists right now
  if (actual < desired) create(desired - actual)
  else if (actual > desired) remove(actual - desired)
  else doNothing()
  waitForChange()                     // the next watch event
}`;

export const OUTAGE = ['off', 'on'];
const DELETE_AT = 15;
const DOWN: [number, number] = [10, 40];

export function desiredStateControllersScenario(values: Record<string, string>): Read<Scenario> {
  const desired = readInt(values, 'desired', 'Desired pods', { min: 1, max: 5 });
  if (!desired.ok) return desired;
  const deleted = readInt(values, 'deleted', 'Pods deleted', { min: 0, max: 3 });
  if (!deleted.ok) return deleted;
  const outage = readChoice(values, 'outage', 'Controller outage', OUTAGE);
  if (!outage.ok) return outage;
  return {
    ok: true,
    value: {
      nodes: nodes(2),
      actions: [
        { at: 0, kind: 'apply', object: replicaSet('web', desired.value) },
        ...(deleted.value > 0 ? [{ at: DELETE_AT, kind: 'delete-pods' as const, owner: 'web', count: deleted.value }] : []),
      ],
      faults: outage.value === 'on' ? [{ kind: 'down', component: 'controllers', from: DOWN[0], to: DOWN[1] }] : [],
    },
  };
}

export function desiredStateControllersSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(desiredStateControllersScenario(values), "Can't run this loop", {
    code: desiredStateControllersCode,
    focus: 'web',
    noops: true,
    lines: { 'create-pod': 'create(desired', 'delete-pod': 'remove(', reconcile: 'doNothing', action: 'waitForChange', 'component-down': 'waitForChange', 'component-up': 'const actual = observe' },
    explain: (event) => {
      if (event.kind === 'action' && event.text.startsWith('kubectl deletes')) {
        return { why: 'Someone deletes pods by hand. The desired state has not changed, so the difference is now the controller\'s job.' };
      }
      if (event.kind === 'action') return { line: 'const desired = read(spec)', why: 'kubectl stores a ReplicaSet: the desired state. Nothing exists yet; the ReplicaSet controller will notice the gap.' };
      if (event.kind === 'reconcile') return { why: 'The controller compares desired with actual. They match, so the loop does nothing until the next change.' };
      if (event.kind === 'component-down') return { why: 'The controller manager is down. Changes still happen and are stored, but nobody acts on them yet.' };
      if (event.kind === 'component-up') {
        return { why: 'The controller is back. It does not replay the events it missed: it reads the current state, counts the gap, and fixes it in one pass. This is what level-triggered means.' };
      }
      if (event.kind === 'create-pod') return { why: 'Actual is below desired, so the controller creates the difference. It never asks why pods are missing.' };
      return undefined;
    },
  });
}
