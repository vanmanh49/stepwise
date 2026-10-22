import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Fault, NodeSpec, Scenario, SimResult, TraceEvent } from '../model';
import type { StepOptions } from '../steps';
import { client, GATEWAY_MS, link, scenarioSteps, service } from './shared';

export const deploymentStrategiesCode = `// a rollout replaces v1 with v2 while requests keep coming
async function rollout(strategy) {
  for (const next of strategy.steps) {
    deploy(next)                       // start v2 instances, stop v1 ones
    await wait(next.pause)
  }
  promote()                            // v2 takes all the traffic
}

// the balancer only uses instances in rotation
function route(req) {
  const version = pickByWeight(weights)      // canary: v2 25%
  return nextInstance(version).handle(req)
}

// canary guard: stop sending to v2 when it fails too often
function onAnswer(instance, ok) {
  if (!ok && instance.version === canary) errors++
  if (errors >= maxErrors) rollback()        // weight back to 0
}`;

export const STRATEGIES = ['recreate', 'rolling', 'blue-green', 'canary'] as const;
const GAP_MS = 40;
const V1 = ['app-1', 'app-2', 'app-3'];
const V2 = ['app-4', 'app-5', 'app-6'];
/** Never reached in a run: instances the plan leaves unused stay not started. */
const NEVER = 20_000;

interface Settings {
  strategy: (typeof STRATEGIES)[number];
  buggy: boolean;
  requests: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const strategy = readChoice(values, 'strategy', 'Strategy', STRATEGIES);
  if (!strategy.ok) return strategy;
  const v2 = readChoice(values, 'v2', 'v2', ['healthy', 'buggy']);
  if (!v2.ok) return v2;
  const requests = readInt(values, 'requests', 'Requests', { min: 6, max: 16 });
  if (!requests.ok) return requests;
  return { ok: true, value: { strategy: strategy.value as Settings['strategy'], buggy: v2.value === 'buggy', requests: requests.value } };
}

const start = (instance: string, at: number): Fault => ({ kind: 'deploy', instance, at, action: 'start' });
const stop = (instance: string, at: number): Fault => ({ kind: 'deploy', instance, at, action: 'stop' });

/** Each strategy's deploy steps, and the balancer's weights when it splits by version. */
function plan(strategy: Settings['strategy'], buggy: boolean): { faults: Fault[]; weights?: Record<string, number>; canary?: { version: string; maxErrors: number } } {
  if (strategy === 'recreate') return { faults: [...V1.map((id) => stop(id, 100)), ...V2.map((id) => start(id, 220))] };
  if (strategy === 'rolling') return { faults: [100, 220, 340].flatMap((at, k) => [start(V2[k]!, at), stop(V1[k]!, at)]) };
  if (strategy === 'blue-green') {
    const back: Fault[] = buggy ? [{ kind: 'shift', balancer: 'balancer', at: 320, weights: { v1: 1, v2: 0 } }] : [];
    return { faults: [{ kind: 'shift', balancer: 'balancer', at: 200, weights: { v1: 0, v2: 1 } }, ...back], weights: { v1: 1, v2: 0 } };
  }
  return { faults: [start('app-5', NEVER), start('app-6', NEVER)], weights: { v2: 0.25, v1: 0.75 }, canary: { version: 'v2', maxErrors: 2 } };
}

export function deploymentStrategiesScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { strategy, buggy, requests } = settings.value;
  const { faults, weights, canary } = plan(strategy, buggy);
  const app = service('app', 2, [], { count: 6 });
  if (app.type === 'service') app.instances.forEach((i, k) => (i.version = k < 3 ? 'v1' : 'v2'));
  const balancer: NodeSpec = {
    id: 'balancer',
    label: 'balancer',
    type: 'balancer',
    column: 1,
    processMs: GATEWAY_MS,
    target: 'app',
    strategy: 'round-robin',
    ...(weights && { weights }),
    ...(canary && { canary }),
  };
  return {
    ok: true,
    value: {
      nodes: [client(), balancer, app],
      links: [link('client', 'balancer'), link('balancer', 'app')],
      requests: Array.from({ length: requests }, (_, i) => ({ label: 'GET /shop', path: '/shop', to: 'balancer', at: i * GAP_MS })),
      faults: [...faults, ...(buggy ? [{ kind: 'errors', node: 'app', version: 'v2', rate: 1, reason: '500: bug in v2' } satisfies Fault] : [])],
      seed: 7,
    },
  };
}

/** Requests each version served so far, and the errors so far. */
function served(result: SimResult, upTo: TraceEvent): Record<string, string | number> {
  const counts = { v1: 0, v2: 0 };
  let errors = 0;
  for (const e of result.trace.slice(0, result.trace.indexOf(upTo) + 1)) {
    if (e.kind === 'pick') counts[V2.includes(e.instance) ? 'v2' : 'v1']++;
    if (e.kind === 'done' && !e.ok) errors++;
  }
  return { 'served by v1/v2': `${counts.v1} / ${counts.v2}`, errors };
}

export function deploymentStrategiesSteps(values: Record<string, string>): Step[] {
  const options = (result: SimResult): StepOptions => ({
    code: deploymentStrategiesCode,
    lines: { fault: 'deploy(next)', drained: 'deploy(next)', pick: 'function route(req)', rollback: 'if (errors >= maxErrors) rollback()', fail: 'function onAnswer(instance, ok)', done: 'promote()' },
    explain: (event) => (event.kind === 'fault' && event.fault.kind === 'shift' ? { line: 'promote()' } : undefined),
    variables: (event) => served(result, event),
  });
  return scenarioSteps(deploymentStrategiesScenario(values), 'Check the settings', options);
}
