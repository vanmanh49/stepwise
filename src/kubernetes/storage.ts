import type { Env } from './env';
import { RECORDS_PER_TICK } from './model';

/** One data tick: every running app writes to each volume it mounts, a PersistentVolume or its own emptyDir. */
export function dataTick(env: Env) {
  const { store } = env;
  const totals = new Map<string, string>();
  for (const pod of store.list('Pod')) {
    if (pod.phase !== 'Running' || (pod.node && env.offline.has(pod.node))) continue;
    for (const volume of pod.volumes ?? []) {
      // Data writes wake no controller and aren't narrated one by one.
      if ('emptyDir' in volume) {
        const current = store.get('Pod', pod.name)!;
        const records = (current.records ?? 0) + RECORDS_PER_TICK;
        if (store.write({ op: 'update', object: { ...current, records } }).ok) totals.set(pod.name, `${pod.name}'s emptyDir has ${records} records`);
      } else if ('claim' in volume) {
        const pvc = store.get('PersistentVolumeClaim', volume.claim);
        const pv = pvc?.volume ? store.get('PersistentVolume', pvc.volume) : undefined;
        if (!pv) continue;
        const records = pv.records + RECORDS_PER_TICK;
        if (store.write({ op: 'update', object: { ...pv, records } }).ok) totals.set(pv.name, `${pv.name} has ${records} records`);
      }
    }
  }
  if (totals.size === 0) return;
  env.apply({ event: { kind: 'records', by: 'kubelet', subjects: [...totals.keys()], text: `Apps keep writing: ${[...totals.values()].join('; ')}` } });
}
