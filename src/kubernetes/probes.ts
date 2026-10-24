import type { Fault } from './model';

export type ProbeKind = 'startup' | 'liveness' | 'readiness';

export const PROBE_NAME: Record<ProbeKind, string> = { startup: 'Startup', liveness: 'Liveness', readiness: 'Readiness' };

/**
 * Whether the app in a container answers at `now`: not while it is still starting (slow-start), and not once it
 * has hung. A hang only affects the container that was running when it happened, so a restart cures it.
 */
export function answers(faults: Fault[], pod: string, startedAt: number, now: number): boolean {
  for (const f of faults) {
    if (!pod.startsWith('prefix' in f ? f.prefix : '\0')) continue;
    if (f.kind === 'slow-start' && now - startedAt < f.seconds) return false;
    if (f.kind === 'hang' && startedAt < f.at && now >= f.at) return false;
  }
  return true;
}
