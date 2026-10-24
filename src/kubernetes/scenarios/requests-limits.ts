import { readChoice, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Deployment, Resources, Scenario } from '../model';
import { deployment, scenarioSteps } from './shared';

export const requestsLimitsCode = `// QoS class, from requests and limits
qos = limits equal requests (cpu and memory) ? 'Guaranteed'
    : any request or limit set ? 'Burstable'
    : 'BestEffort'

// kubelet, every metrics tick
cpu = min(wanted, limits.cpu)        // over the limit: throttled, never killed
if (memory > limits.memory)
  kill(pod, 'OOMKilled')             // exit code 137, then restart

// node out of memory: evict one pod
evict(first(BestEffort, Burstable over request, the rest))`;

export const QOS = ['BestEffort', 'Burstable', 'Guaranteed'];
export const CPU_LIMITS = ['none', '500m', '1000m'];
export const LEAK = ['off', 'on'];
const NODE_MEMORY = 768;

function resourcesFor(qos: string, cpuLimit: string): Resources {
  const limit = cpuLimit === 'none' ? undefined : Number.parseInt(cpuLimit, 10);
  if (qos === 'BestEffort') return {};
  if (qos === 'Guaranteed') return { cpu: { request: limit ?? 500, limit: limit ?? 500 }, memory: { request: 256, limit: 256 } };
  return { cpu: { request: 250, ...(limit !== undefined && { limit }) }, memory: { request: 128 } };
}

const withResources = (d: Deployment, resources: Resources): Deployment => ({ ...d, template: { ...d.template, cpu: 0, resources } });

export function requestsLimitsScenario(values: Record<string, string>): Read<Scenario> {
  const qos = readChoice(values, 'qos', 'QoS class', QOS);
  if (!qos.ok) return qos;
  const cpuLimit = readChoice(values, 'cpuLimit', 'CPU limit', CPU_LIMITS);
  if (!cpuLimit.ok) return cpuLimit;
  const leak = readChoice(values, 'leak', 'Memory leak', LEAK);
  if (!leak.ok) return leak;
  return {
    ok: true,
    value: {
      nodes: [{ name: 'node-1', cpu: 4, memory: NODE_MEMORY }],
      actions: [
        { at: 0, kind: 'apply', object: withResources(deployment('web', 2), resourcesFor(qos.value, cpuLimit.value)) },
        { at: 0, kind: 'apply', object: withResources(deployment('batch', 1), {}) },
      ],
      faults: leak.value === 'on' ? [{ kind: 'leak', prefix: 'web', miPerS: 10 }] : [],
      load: { target: 'web', points: [[0, 20], [30, 20], [40, 120]], cpuPerRequest: 10 },
      until: 120,
      runToEnd: true,
    },
  };
}

export function requestsLimitsSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(requestsLimitsScenario(values), "Can't run these pods", {
    code: requestsLimitsCode,
    focus: 'web',
    lines: { throttle: 'cpu = min', metrics: 'cpu = min', 'oom-kill': "kill(pod, 'OOMKilled')", evict: 'evict(first', 'create-pod': 'qos = limits', restart: "kill(pod, 'OOMKilled')" },
    explain: (event) => {
      if (event.kind === 'evict') {
        return { why: 'The node has more memory in use than it has. The kubelet must free some, so it evicts by QoS class: BestEffort pods promised nothing and go first, then Burstable pods using more than they requested. Guaranteed pods go last.' };
      }
      if (event.kind === 'throttle') return { why: 'Traffic grew, so the pod wants more CPU than its limit. CPU can be shared out over time, so the kernel just gives it less: the pod gets slower, but it keeps running.' };
      return undefined;
    },
  });
}
