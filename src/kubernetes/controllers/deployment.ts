import { replicaSetName } from '../names';
import { resolveAmount, type Deployment, type ReplicaSet, type Template } from '../model';
import type { Change, Reconcile } from './types';

const sameTemplate = (a: Template, b: Template) => JSON.stringify(a) === JSON.stringify(b);

/** `kubectl set image`: the old template goes into history and the revision moves on. */
export function withImage(d: Deployment, image: string): Deployment {
  return { ...d, template: { ...d.template, image }, history: [...d.history, d.template], revision: d.revision + 1 };
}

/** `kubectl rollout undo`: back to the previous template (which then sits in history in place of the one undone). */
export function rolledBack(d: Deployment): Deployment | undefined {
  const previous = d.history.at(-1);
  if (!previous) return undefined;
  return { ...d, template: previous, history: [...d.history.slice(0, -1), d.template], revision: d.revision + 1 };
}

/**
 * Keeps one ReplicaSet per template and moves pods from the old ones to the current one, never above
 * replicas + maxSurge pods in total and never below replicas − maxUnavailable ready pods.
 */
export const reconcileDeployments: Reconcile = (ctx) => {
  const changes: Change[] = [];
  const pods = ctx.store.list('Pod');
  const replicaSets = ctx.store.list('ReplicaSet');
  for (const d of ctx.store.list('Deployment')) {
    const owned = replicaSets.filter((rs) => rs.owner === d.name);
    const maxTotal = d.replicas + resolveAmount(d.maxSurge, d.replicas, 'up');
    const minReady = d.replicas - resolveAmount(d.maxUnavailable, d.replicas, 'down');
    let total = owned.reduce((sum, rs) => sum + rs.replicas, 0);
    const scale = (rs: ReplicaSet, replicas: number, why: string) => {
      const direction = replicas > rs.replicas ? 'up' : 'down';
      rs.replicas = replicas;
      changes.push({ write: { op: 'update', object: { ...rs } }, event: { kind: 'scale', by: 'controllers', subjects: [rs.name, d.name], text: `Deployment ${d.name} scales ${rs.name} ${direction} to ${replicas} (${why})` } });
    };

    let current = owned.find((rs) => sameTemplate(rs.template, d.template));
    const up = Math.max(0, Math.min(d.replicas - (current?.replicas ?? 0), maxTotal - total));
    if (!current) {
      const name = replicaSetName(ctx, d.name);
      current = { kind: 'ReplicaSet', name, replicas: up, selector: d.selector, template: d.template, owner: d.name, revision: d.revision };
      changes.push({
        write: { op: 'create', object: { ...current } },
        event: { kind: 'rollout', by: 'controllers', subjects: [name, d.name], text: `Deployment ${d.name} creates ReplicaSet ${name} for ${d.template.image} with ${up} of ${d.replicas} pods` },
      });
    } else if (up > 0) {
      scale(current, current.replicas + up, `surge allows ${maxTotal} pods in total`);
    }
    total += up;

    const olds = owned.filter((rs) => rs !== current && rs.replicas > 0).toSorted((a, b) => a.revision - b.revision);
    // Counted from ReplicaSet sizes, as Kubernetes does, so a scale-down the ReplicaSet controller hasn't carried out yet
    // isn't counted twice; pods of the current set that aren't ready yet can't be relied on.
    const readyCurrent = pods.filter((p) => p.ready && p.owner === current.name).length;
    let removable = Math.max(0, total - minReady - Math.max(0, current.replicas - readyCurrent));
    for (const old of olds) {
      const cut = Math.min(old.replicas, removable);
      if (cut === 0) continue;
      removable -= cut;
      scale(old, old.replicas - cut, `${minReady} pods must stay ready`);
    }
    if (olds.every((rs) => rs.replicas === 0) && current.replicas > d.replicas) scale(current, d.replicas, `replicas is ${d.replicas}`);
  }
  return changes;
};
