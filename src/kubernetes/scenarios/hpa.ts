import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { HorizontalPodAutoscaler, Scenario } from '../model';
import { deployment, nodes, scenarioSteps } from './shared';

export const hpaCode = `// HPA, every sync (5 s here; 15 s in Kubernetes)
const usage = average(pods.cpu) / average(pods.request)
const ratio = usage / target
if (Math.abs(ratio - 1) <= 0.1) return              // close enough
let desired = clamp(ceil(readyPods * ratio), min, max)
// scaling up is rate-limited: at most +4 pods or double, per sync
if (desired > replicas) desired = min(desired, max(replicas + 4, replicas * 2))
// scaling down waits: take the highest wish of the last 30 s
if (desired < replicas) desired = max(recent wishes)
deployment.replicas = desired`;

export const CURVES = ['spike', 'ramp', 'flapping'];
export const TARGETS = ['30', '50', '80'];
const POINTS: Record<string, [number, number][]> = {
  spike: [[0, 10], [30, 10], [31, 40], [70, 40], [71, 10]],
  ramp: [[0, 10], [20, 10], [100, 60]],
  flapping: [[0, 10], [30, 10], [31, 40], [40, 40], [41, 10], [50, 10], [51, 40], [60, 40], [61, 10], [70, 10], [71, 40], [80, 40], [81, 10]],
};
const MIN = 2;

export function hpaScenario(values: Record<string, string>): Read<Scenario> {
  const curve = readChoice(values, 'curve', 'Traffic', CURVES);
  if (!curve.ok) return curve;
  const max = readInt(values, 'max', 'Max replicas', { min: 4, max: 8 });
  if (!max.ok) return max;
  const target = readChoice(values, 'target', 'Target CPU', TARGETS);
  if (!target.ok) return target;
  const d = deployment('web', MIN);
  const hpa: HorizontalPodAutoscaler = { kind: 'HorizontalPodAutoscaler', name: 'web', target: 'web', min: MIN, max: max.value, targetCpuPercent: Number(target.value) };
  return {
    ok: true,
    value: {
      nodes: nodes(3),
      actions: [{ at: 0, kind: 'apply', object: { ...d, template: { ...d.template, cpu: 0.1, resources: { cpu: { request: 100 } } } } }, { at: 0, kind: 'apply', object: hpa }],
      faults: [],
      load: { target: 'web', points: POINTS[curve.value]!, cpuPerRequest: 10 },
      until: 160,
      runToEnd: true,
    },
  };
}

export function hpaSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(hpaScenario(values), "Can't run this autoscaler", {
    code: hpaCode,
    focus: 'web',
    lines: { metrics: 'const usage', hpa: 'deployment.replicas = desired' },
    explain: (event) => {
      if (event.kind !== 'hpa') return undefined;
      const down = /→ (\d+) replicas \(from (\d+)\)/.exec(event.text);
      if (down && Number(down[1]) < Number(down[2])) {
        return { line: 'max(recent wishes)', why: 'Load fell a while ago. The HPA only scales down once every recommendation of the last 30 s (5 minutes in Kubernetes) agrees, so a short dip doesn\'t remove pods it will need again.' };
      }
      return event.text.includes('limited to')
        ? { line: 'max(replicas + 4', why: 'The pods want more replicas than one sync may add. By default the HPA adds at most 4 pods or doubles them, whichever is more, so a big spike is met in a few quick steps.' }
        : { line: 'clamp(ceil(readyPods * ratio)', why: 'The pods use more CPU than the target, so the HPA scales up without waiting: ready pods × usage ÷ target, rounded up and kept between min and max.' };
    },
  });
}
