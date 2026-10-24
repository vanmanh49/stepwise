import { refusal, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Amount, Deployment, Pod, ReplicaSet, Scenario, Selector, Service, SimResult, Template } from '../model';
import { simulate } from '../sim';
import { traceSteps, type StepOptions } from '../steps';
import { emptyClusterView } from '../view';

export const nodes = (count: number, cpu = 4) => Array.from({ length: count }, (_, i) => ({ name: `node-${i + 1}`, cpu }));

export const appTemplate = (app: string, image = 'app:v1', cpu = 1): Template => ({ labels: { app }, image, cpu, restartPolicy: 'Always' });

export const appSelector = (app: string): Selector => [{ key: 'app', op: '=', values: [app] }];

export function deployment(name: string, replicas: number, options: { surge?: Amount; unavailable?: Amount; image?: string } = {}): Deployment {
  return {
    kind: 'Deployment',
    name,
    replicas,
    selector: appSelector(name),
    template: appTemplate(name, options.image),
    maxSurge: options.surge ?? '25%',
    maxUnavailable: options.unavailable ?? '25%',
    revision: 1,
    history: [],
  };
}

export const replicaSet = (name: string, replicas: number): ReplicaSet => ({ kind: 'ReplicaSet', name, replicas, selector: appSelector(name), template: appTemplate(name), revision: 1 });

export const service = (name: string, selector: Selector = appSelector(name)): Service => ({ kind: 'Service', name, selector });

export const pod = (name: string, template: Template): Pod => ({ ...structuredClone(template), kind: 'Pod', name, phase: 'Pending', ready: false, restarts: 0, createdAt: 0 });

/** The steps for a form lesson: one refusal step for unusable values, else the simulated run. */
export function scenarioSteps(read: Read<Scenario>, refusalTitle: string, options: StepOptions | ((result: SimResult) => StepOptions)): Step[] {
  if (!read.ok) return refusal(refusalTitle, read.why, emptyClusterView());
  const result = simulate(read.value);
  return traceSteps(result, typeof options === 'function' ? options(result) : options);
}
