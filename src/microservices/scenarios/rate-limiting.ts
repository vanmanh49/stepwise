import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { NodeSpec, RateLimit, RequestSpec, Scenario } from '../model';
import type { StepOptions } from '../steps';
import { client, gateway, link, scenarioSteps, service } from './shared';

export const rateLimitingCode = `function allow(req) {
  const key = perCaller ? req.caller : 'everyone'
  if (algorithm === 'fixed-window') {
    const window = Math.floor(now() / WINDOW_MS)    // 0–99 ms, 100–199 ms…
    count[key][window] += 1
    return count[key][window] <= LIMIT
  }
  refill(bucket[key])                // LIMIT tokens per WINDOW_MS, up to LIMIT
  if (bucket[key].tokens < 1) return false
  bucket[key].tokens -= 1
  return true
}

function gateway(req) {
  if (!allow(req)) return 429        // Too Many Requests
  return forward(req)
}`;

export const ALGORITHMS = ['fixed-window', 'token-bucket'] as const;
export const TRAFFIC = ['steady', 'edge', 'noisy'] as const;
const WINDOW_MS = 100;

const request = (at: number, caller: string): RequestSpec => ({ label: `GET /data (${caller})`, path: '/data', to: 'gateway', at, caller });

/** steady: 10 every 25 ms. edge: 5 just before a window ends, 5 just after. noisy: bob sends 8 quickly while alice sends 2. */
function traffic(kind: (typeof TRAFFIC)[number]): RequestSpec[] {
  if (kind === 'steady') return Array.from({ length: 10 }, (_, i) => request(i * 25, 'alice'));
  if (kind === 'edge') return [...Array.from({ length: 5 }, () => request(90, 'alice')), ...Array.from({ length: 5 }, () => request(110, 'alice'))];
  return [...Array.from({ length: 8 }, (_, i) => request(i * 5, 'bob')), request(12, 'alice'), request(42, 'alice')].toSorted((a, b) => a.at - b.at);
}

function read(values: Record<string, string>): Read<{ limit: RateLimit; traffic: (typeof TRAFFIC)[number] }> {
  const algorithm = readChoice(values, 'algorithm', 'Algorithm', ALGORITHMS);
  if (!algorithm.ok) return algorithm;
  const limit = readInt(values, 'limit', 'Limit', { min: 1, max: 10 });
  if (!limit.ok) return limit;
  const per = readChoice(values, 'per', 'Limit per', ['all', 'caller']);
  if (!per.ok) return per;
  const kind = readChoice(values, 'traffic', 'Traffic', TRAFFIC);
  if (!kind.ok) return kind;
  return {
    ok: true,
    value: {
      limit: { algorithm: algorithm.value as RateLimit['algorithm'], limit: limit.value, windowMs: WINDOW_MS, per: per.value as RateLimit['per'] },
      traffic: kind.value as (typeof TRAFFIC)[number],
    },
  };
}

export function rateLimitingScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const front: NodeSpec = { ...(gateway([{ prefix: '/', to: 'api' }]) as Extract<NodeSpec, { type: 'gateway' }>), rateLimit: settings.value.limit };
  return {
    ok: true,
    value: {
      nodes: [client(), front, service('api', 2)],
      links: [link('client', 'gateway'), link('gateway', 'api')],
      requests: traffic(settings.value.traffic),
      faults: [],
    },
  };
}

export function rateLimitingSteps(values: Record<string, string>): Step[] {
  const options: StepOptions = {
    code: rateLimitingCode,
    lines: { arrive: 'function gateway(req)', limit: 'function allow(req)', reject: 'return 429', route: 'return forward(req)', done: 'function gateway(req)' },
    explain: (event) => {
      if (event.kind === 'limit') return { line: values.algorithm?.trim() === 'token-bucket' ? 'bucket[key].tokens -= 1' : 'return count[key][window] <= LIMIT' };
      if (event.kind === 'send' && event.message.from === 'gateway') return { line: event.message.kind === 'reply' && !event.message.ok ? 'return 429' : 'return forward(req)' };
      return undefined;
    },
  };
  return scenarioSteps(rateLimitingScenario(values), 'Check the settings', options);
}
