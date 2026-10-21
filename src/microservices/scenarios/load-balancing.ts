import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario, Strategy } from '../model';
import type { StepOptions } from '../steps';
import { client, GATEWAY_MS, link, scenarioSteps, service } from './shared';

export const loadBalancingCode = `function pick(instances) {
  const healthy = instances.filter((i) => !i.down)
  switch (strategy) {
    case "round-robin":       return healthy[turn++ % healthy.length]
    case "least-connections": return minBy(healthy, (i) => i.inFlight)
    case "random":            return healthy[randomInt(healthy.length)]
  }
}

function onProbe(instance, answered) { // every 25 ms, with health checks on
  instance.down = !answered
}

function handle(req) {
  const instance = pick(api.instances)
  return forward(instance, req)
}`;

const API_MS = 20;
const SLOW_MS = 120;
const HEALTH_CHECK_MS = 25;
const DIES_AT = 30;

export const STRATEGIES: Strategy[] = ['round-robin', 'least-connections', 'random'];

export function loadBalancingScenario(values: Record<string, string>): Read<Scenario> {
  const strategy = readChoice(values, 'strategy', 'Strategy', STRATEGIES);
  if (!strategy.ok) return strategy;
  const instances = readInt(values, 'instances', 'Instances', { min: 2, max: 4 });
  if (!instances.ok) return instances;
  const slow = readChoice(values, 'slow', 'Slow instance', ['none', 'api-1']);
  if (!slow.ok) return slow;
  const health = readChoice(values, 'health', 'Health checks', ['off', 'on']);
  if (!health.ok) return health;
  const dead = readChoice(values, 'dead', 'Dead instance', ['none', 'last']);
  if (!dead.ok) return dead;

  const api = service('api', 2, [], { count: instances.value, processMs: API_MS });
  if (api.type === 'service' && slow.value === 'api-1') api.instances[0]!.processMs = SLOW_MS;
  return {
    ok: true,
    value: {
      nodes: [
        client(),
        {
          id: 'balancer',
          label: 'balancer',
          type: 'balancer',
          column: 1,
          processMs: GATEWAY_MS,
          target: 'api',
          strategy: strategy.value as Strategy,
          ...(health.value === 'on' && { healthCheckMs: HEALTH_CHECK_MS }),
        },
        api,
      ],
      links: [link('client', 'balancer'), link('balancer', 'api')],
      requests: Array.from({ length: 12 }, (_, i) => ({ label: 'GET /items', path: '/items', to: 'balancer', at: 10 * i })),
      faults: dead.value === 'last' ? [{ kind: 'kill', instance: `api-${instances.value}`, at: DIES_AT }] : [],
      seed: 7,
    },
  };
}

const PICK_LINE: Record<Strategy, string> = {
  'round-robin': 'case "round-robin"',
  'least-connections': 'case "least-connections"',
  random: 'case "random"',
};

export function loadBalancingSteps(values: Record<string, string>): Step[] {
  const options: StepOptions = {
    code: loadBalancingCode,
    lines: { mark: 'function onProbe(', handle: 'return forward(instance, req)', done: 'function handle(req)', heartbeat: 'function onProbe(', fault: 'function handle(req)' },
    explain: (event) => {
      if (event.kind === 'pick') return { line: PICK_LINE[event.strategy] };
      if (event.kind === 'send') {
        const m = event.message;
        if (m.from === 'client') return { line: 'function handle(req)' };
        return { line: 'return forward(instance, req)' };
      }
      if (event.kind === 'fail' && event.request && event.reason.endsWith('refused the connection')) {
        return {
          why:
            values.health?.trim() === 'on'
              ? `${event.at} is dead, and the next health check hasn't found out yet. Health checks run every ${HEALTH_CHECK_MS} ms.`
              : `${event.at} is dead, but the balancer has no way to know: without health checks it keeps sending ${event.at} its share of requests.`,
        };
      }
      return undefined;
    },
  };
  return scenarioSteps(loadBalancingScenario(values), 'Check the settings', options);
}
