import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { resolveAmount, type Action, type Amount, type Scenario } from '../model';
import { deployment, nodes, scenarioSteps } from './shared';

export const deploymentsRollingUpdatesCode = `// Deployment controller, on every change
const maxTotal = replicas + maxSurge           // e.g. 4 + 1
const minReady = replicas - maxUnavailable     // e.g. 4 - 1
// 1. grow the new ReplicaSet, never above maxTotal pods
newRS.replicas += min(replicas - newRS.replicas, maxTotal - total)
// 2. shrink old ReplicaSets, keeping minReady pods ready
oldRS.replicas -= min(oldRS.replicas, total - minReady - newNotReady)

// kubectl set image deployment/web app=app:v2
deployment.template.image = 'app:v2'        // a new ReplicaSet
// kubectl rollout undo deployment/web
deployment.template = previousTemplate      // the old ReplicaSet again`;

export const AMOUNTS = ['25%', '1', '0'];
export const IMAGES = ['good', 'bad'];
export const ROLLBACK = ['off', 'on'];
const UPDATE_AT = 15;
const ROLLBACK_AT = 60;
const UNTIL = 150;

const amount = (text: string): Amount => (text.endsWith('%') ? (text as Amount) : Number(text));

export function deploymentsRollingUpdatesScenario(values: Record<string, string>): Read<Scenario> {
  const replicas = readInt(values, 'replicas', 'Replicas', { min: 2, max: 6 });
  if (!replicas.ok) return replicas;
  const surge = readChoice(values, 'surge', 'maxSurge', AMOUNTS);
  if (!surge.ok) return surge;
  const unavailable = readChoice(values, 'unavailable', 'maxUnavailable', AMOUNTS);
  if (!unavailable.ok) return unavailable;
  const image = readChoice(values, 'image', 'New image', IMAGES);
  if (!image.ok) return image;
  const rollback = readChoice(values, 'rollback', 'Roll back at 60 s', ROLLBACK);
  if (!rollback.ok) return rollback;
  const maxSurge = amount(surge.value);
  const maxUnavailable = amount(unavailable.value);
  if (resolveAmount(maxSurge, replicas.value, 'up') === 0 && resolveAmount(maxUnavailable, replicas.value, 'down') === 0) {
    return { ok: false, why: "maxSurge and maxUnavailable can't both be 0: the rollout could never start." };
  }
  const v2 = image.value === 'good' ? 'app:v2' : 'app:v2-typo';
  const actions: Action[] = [
    { at: 0, kind: 'apply', object: deployment('web', replicas.value, { surge: maxSurge, unavailable: maxUnavailable }) },
    { at: UPDATE_AT, kind: 'set-image', target: 'web', image: v2 },
    ...(rollback.value === 'on' ? [{ at: ROLLBACK_AT, kind: 'rollback' as const, target: 'web' }] : []),
  ];
  return { ok: true, value: { nodes: nodes(3), actions, faults: [{ kind: 'bad-image', image: 'app:v2-typo' }], until: UNTIL } };
}

export function deploymentsRollingUpdatesSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(deploymentsRollingUpdatesScenario(values), "Can't run this rollout", {
    code: deploymentsRollingUpdatesCode,
    focus: 'web',
    lines: { 'create-pod': 'newRS.replicas +=', 'delete-pod': 'oldRS.replicas -=', rollout: 'deployment.template.image', 'pull-fail': 'newRS.replicas +=' },
    explain: (event) => {
      if (event.kind === 'action' && event.text.includes('sets Deployment')) {
        return { line: 'deployment.template.image', why: 'Changing the pod template is what starts a rollout. The Deployment keeps one ReplicaSet per template, so the new image needs a new ReplicaSet.' };
      }
      if (event.kind === 'action' && event.text.includes('rolls Deployment')) {
        return { line: 'deployment.template = previous', why: 'Rolling back puts the previous template back. Its ReplicaSet still exists, so the Deployment simply scales it up again and the broken one down.' };
      }
      if (event.kind === 'scale' && event.text.includes(' up to ')) return { line: 'newRS.replicas +=', why: 'The new ReplicaSet grows, but total pods may not pass replicas + maxSurge.' };
      if (event.kind === 'scale') return { line: 'oldRS.replicas -=', why: 'The old ReplicaSet shrinks, but only as far as keeps replicas − maxUnavailable pods ready. New pods that aren\'t ready yet don\'t count.' };
      if (event.kind === 'pull-fail') return { why: 'The new image doesn\'t exist, so the new pods never become ready. The Deployment can\'t shrink v1 further without breaking maxUnavailable, so the rollout stalls, and v1 keeps serving.' };
      return undefined;
    },
  });
}
