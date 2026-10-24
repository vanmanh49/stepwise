import { HPA_STABILISE_S, HPA_TOLERANCE } from '../model';
import type { Change, Ctx } from './types';

/** Each HPA's recent recommendations, newest last: scale-down follows the highest one in the window. */
export type HpaHistory = Map<string, { t: number; desired: number }[]>;

/**
 * One HPA sync: ratio = the ready pods' average CPU use ÷ their request ÷ the target; outside the 10% tolerance,
 * desired = ceil(ready pods × ratio), clamped to [min, max]; a scale-down takes the highest recommendation of the
 * last 30 s, so a brief dip doesn't remove pods.
 */
export function reconcileHpas(ctx: Ctx, history: HpaHistory): Change[] {
  const changes: Change[] = [];
  for (const hpa of ctx.store.list('HorizontalPodAutoscaler')) {
    const d = ctx.store.get('Deployment', hpa.target);
    if (!d) continue;
    const owners = new Set(ctx.store.list('ReplicaSet').filter((rs) => rs.owner === d.name).map((rs) => rs.name));
    const pods = ctx.store.list('Pod').filter((p) => p.phase === 'Running' && p.ready && p.owner && owners.has(p.owner));
    if (pods.length === 0) continue;
    if (pods.some((p) => p.resources?.cpu?.request === undefined && p.resources?.cpu?.limit === undefined)) {
      const note = 'missing request for cpu';
      if (hpa.note !== note) {
        changes.push({ write: { op: 'update', object: { ...hpa, note } }, event: { kind: 'hpa', by: 'controllers', subjects: [hpa.name, d.name], text: `HPA ${hpa.name} can't scale: its pods have no CPU request to compare usage with` } });
      }
      continue;
    }
    const request = pods.reduce((s, p) => s + (p.resources!.cpu!.request ?? p.resources!.cpu!.limit!), 0);
    const usage = pods.reduce((s, p) => s + (p.cpuUsage ?? 0), 0);
    const percent = Math.round((100 * usage) / request);
    const ratio = percent / hpa.targetCpuPercent;
    const raw = Math.abs(ratio - 1) <= HPA_TOLERANCE ? d.replicas : Math.ceil(pods.length * ratio);
    const recommended = Math.min(hpa.max, Math.max(hpa.min, raw));
    const recent = [...(history.get(hpa.name) ?? []), { t: ctx.now, desired: recommended }].filter((h) => h.t > ctx.now - HPA_STABILISE_S);
    history.set(hpa.name, recent);
    const desired = recommended < d.replicas ? Math.min(d.replicas, Math.max(...recent.map((h) => h.desired))) : recommended;
    if (desired === d.replicas) continue;
    const capped = raw > hpa.max ? `, capped at max ${hpa.max}` : '';
    changes.push({
      write: { op: 'update', object: { ...d, replicas: desired } },
      event: { kind: 'hpa', by: 'controllers', subjects: [hpa.name, d.name], text: `HPA ${hpa.name}: CPU ${percent}% of request vs target ${hpa.targetCpuPercent}% → ${desired} replicas (from ${d.replicas})${capped}` },
    });
  }
  return changes;
}
