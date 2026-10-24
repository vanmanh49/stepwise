import { readChoice, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Action, Fault, Pod, Scenario } from '../model';
import { deployment, scenarioSteps, service } from './shared';

export const probesCode = `// kubelet, every periodSeconds, for each probe
if (startup && !startup.passed) {        // the others wait for it
  if (answers(app)) startup.passed = true
  else if (++startup.failures >= threshold) restart(container)
}
if (liveness && !answers(app))
  if (++liveness.failures >= threshold)
    restart(container)                   // cures a hang
if (readiness)
  pod.ready = answers(app)               // Endpoints follow ready`;

export const SWITCH = ['off', 'on'];
const PROBE = { periodS: 2, failureThreshold: 3 };
/** 15 tries × 2 s: a 30 s budget for starting. */
const STARTUP = { periodS: 2, failureThreshold: 15 };
const SLOW_S = 20;
const HANG_AT = 40;

export function probesScenario(values: Record<string, string>): Read<Scenario> {
  const read = (name: string, label: string) => readChoice(values, name, label, SWITCH);
  const fields = [read('liveness', 'Liveness probe'), read('readiness', 'Readiness probe'), read('startup', 'Startup probe'), read('slowStart', 'Slow start'), read('hang', 'Hang at 40 s')];
  const bad = fields.find((f) => !f.ok);
  if (bad && !bad.ok) return bad;
  const [liveness, readiness, startup, slow, hang] = fields.map((f) => f.ok && f.value === 'on');
  const probes: NonNullable<Pod['probes']> = { ...(liveness && { liveness: PROBE }), ...(readiness && { readiness: PROBE }), ...(startup && { startup: STARTUP }) };
  const d = deployment('web', 2);
  const faults: Fault[] = [...(slow ? [{ kind: 'slow-start' as const, prefix: 'web', seconds: SLOW_S }] : []), ...(hang ? [{ kind: 'hang' as const, prefix: 'web', at: HANG_AT }] : [])];
  const requests: Action[] = Array.from({ length: 36 }, (_, i) => ({ at: 10 + 2 * i, kind: 'request', id: `#${i + 1}`, service: 'web' }));
  return {
    ok: true,
    value: {
      nodes: [{ name: 'node-1', cpu: 4 }],
      actions: [{ at: 0, kind: 'apply', object: { ...d, template: { ...d.template, probes } } }, { at: 0, kind: 'apply', object: service('web') }, ...requests],
      faults,
      until: 90,
      runToEnd: true,
    },
  };
}

export function probesSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(probesScenario(values), "Can't run these probes", {
    code: probesCode,
    lines: { 'probe-ok': 'startup.passed = true', exit: 'restart(container)                   // cures', ready: 'pod.ready = answers', 'not-ready': 'pod.ready = answers' },
    explain: (event) => {
      if (event.kind === 'probe-fail') {
        if (event.text.startsWith('Startup')) return { line: '++startup.failures', why: 'The app is still starting. The startup probe has a long budget (15 tries × 2 s), and while it runs, the liveness probe waits.' };
        if (event.text.startsWith('Liveness')) return { line: '++liveness.failures', why: 'The liveness probe asks "is the app still alive?". It got no answer. After 3 misses in a row the kubelet restarts the container.' };
        return { line: 'pod.ready = answers', why: 'The readiness probe asks "can the app take traffic?". After 3 misses the pod is marked not ready and leaves the Service\'s endpoints.' };
      }
      if (event.kind === 'exit') return { why: 'A restart is the cure for a hang, but not for a slow start: a liveness probe without a startup probe kills an app that simply hasn\'t finished starting.' };
      return undefined;
    },
  });
}
