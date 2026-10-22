import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { ServicesView, Step } from '../../types/visualization';
import type { Fault, Scenario, SimResult, TraceEvent } from '../model';
import { seeded } from '../sim';
import type { StepOptions } from '../steps';
import { spansOf } from '../tracing';
import { client, db, gateway, link, scenarioSteps, service } from './shared';

export const distributedTracingCode = `// every service: continue the caller's trace, or start one
async function handle(req) {
  const parent = parseTraceparent(req.headers)
  const span = tracer.startSpan(req.path, { parent })
  try {
    const calls = downstream.map((svc) => {
      const headers = {}
      headers.traceparent = span.context()   // pass the trace on
      return svc.call(req, { headers })
    })
    return await Promise.all(calls)
  } finally {
    span.end()                               // its length is now known
  }
}

// head sampling: decide once, at the edge
const sampled = Math.random() < rate`;

export const SLOW = ['none', 'payments', 'inventory'] as const;
export const SAMPLING = ['all', '10%'] as const;
const GAP_MS = 60;
const SLOW_MS = 200;
/** The slowdown starts with #3. */
const SLOW_FROM = 2 * GAP_MS;
const SEED = 7;

/** Which requests head sampling keeps: one seeded draw per request, in order. */
export function sampledOf(requests: number, rate: number): Set<string> {
  const draw = seeded(SEED);
  return new Set(Array.from({ length: requests }, (_, i) => [`#${i + 1}`, draw()] as const).flatMap(([id, x]) => (x < rate ? [id] : [])));
}

interface Settings {
  slow: (typeof SLOW)[number];
  propagate: boolean;
  rate: number;
  requests: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const slow = readChoice(values, 'slow', 'Slow service', SLOW);
  if (!slow.ok) return slow;
  const propagate = readChoice(values, 'propagate', 'Propagate context', ['off', 'on']);
  if (!propagate.ok) return propagate;
  const sampling = readChoice(values, 'sampling', 'Sampling', SAMPLING);
  if (!sampling.ok) return sampling;
  const requests = readInt(values, 'requests', 'Requests', { min: 1, max: 5 });
  if (!requests.ok) return requests;
  return { ok: true, value: { slow: slow.value as Settings['slow'], propagate: propagate.value === 'on', rate: sampling.value === 'all' ? 1 : 0.1, requests: requests.value } };
}

export function distributedTracingScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { slow, requests } = settings.value;
  const faults: Fault[] = slow === 'none' ? [] : [{ kind: 'slow', instance: `${slow}-1`, processMs: SLOW_MS, from: SLOW_FROM }];
  return {
    ok: true,
    value: {
      nodes: [
        client(),
        gateway([{ prefix: '/orders', to: 'orders' }]),
        service('orders', 2, ['payments', 'inventory'], { parallel: true }),
        service('payments', 3, ['payments-db']),
        service('inventory', 3, ['inventory-db']),
        db('payments-db', 4),
        db('inventory-db', 4),
      ],
      links: [link('client', 'gateway'), link('gateway', 'orders'), link('orders', 'payments'), link('orders', 'inventory'), link('payments', 'payments-db'), link('inventory', 'inventory-db')],
      requests: Array.from({ length: requests }, (_, i) => ({ label: 'GET /orders', path: '/orders', to: 'gateway', at: i * GAP_MS })),
      faults,
      seed: SEED,
    },
  };
}

/** The request a step is about: its own, or the latest one seen so far. */
function requestOf(trace: TraceEvent[], index: number): string | undefined {
  for (let i = index; i >= 0; i--) {
    const e = trace[i]!;
    const id = 'request' in e && typeof e.request === 'string' ? e.request : e.kind === 'send' || e.kind === 'arrive' ? e.message.request : undefined;
    if (id) return id.split('/')[0];
  }
  return undefined;
}

export function distributedTracingSteps(values: Record<string, string>): Step[] {
  const settings = read(values);
  const scenario = distributedTracingScenario(values);
  if (!settings.ok || !scenario.ok) return scenarioSteps(scenario, 'Check the settings', { code: distributedTracingCode, lines: {} });
  const { propagate, rate, requests } = settings.value;
  const sampled = sampledOf(requests, rate);
  const spansAt = (result: SimResult, event: TraceEvent): NonNullable<ServicesView['spans']> => {
    const index = result.trace.indexOf(event);
    const request = requestOf(result.trace, index) ?? '#1';
    if (!sampled.has(request)) return { title: `${request} was not sampled`, endMs: result.endedAt, nowMs: event.t, rows: [] };
    const rows = spansOf(scenario.value, result.trace, index + 1, { propagate, sampled }).get(request) ?? [];
    const traces = new Set(rows.map((r) => r.trace)).size;
    return { title: propagate ? `trace of ${request}` : `${request}: ${traces} separate trace${traces === 1 ? '' : 's'}`, endMs: result.endedAt, nowMs: event.t, rows };
  };
  const options = (result: SimResult): StepOptions => ({
    code: distributedTracingCode,
    lines: { handle: 'const span = tracer.startSpan(', send: 'headers.traceparent =', done: 'span.end()', route: 'async function handle(req)' },
    explain: (event) => (event.kind === 'send' && event.message.kind === 'reply' ? { line: 'span.end()' } : undefined),
    extend: (event) => ({ spans: spansAt(result, event) }),
    variables: (event) => {
      const active = spansAt(result, event).rows.find((r) => r.role === 'active');
      return { 'slowest span': active ? `${active.label.split(' ')[0]} ${active.ms} ms` : '–' };
    },
  });
  return scenarioSteps(scenario, 'Check the settings', options);
}
