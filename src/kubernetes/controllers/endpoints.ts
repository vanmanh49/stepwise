import { matches } from '../selector';
import type { Change, Reconcile } from './types';

/** Each Service's Endpoints: the ready pods its selector matches, written only when the list changes. */
export const reconcileEndpoints: Reconcile = (ctx) => {
  const changes: Change[] = [];
  const pods = ctx.store.list('Pod');
  for (const service of ctx.store.list('Service')) {
    const ready = pods.filter((p) => p.ready && matches(service.selector, p.labels)).map((p) => p.name);
    const current = ctx.store.get('Endpoints', service.name);
    if (current && current.pods.join() === ready.join()) continue;
    changes.push({
      write: { op: current ? 'update' : 'create', object: { kind: 'Endpoints', name: service.name, pods: ready } },
      event: { kind: 'endpoints', by: 'controllers', subjects: [service.name, ...ready], text: `Endpoints ${service.name}: ${ready.length ? ready.join(', ') : 'no ready pods'}` },
    });
  }
  return changes;
};
