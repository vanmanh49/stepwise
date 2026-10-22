import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { RetryPolicy, Scenario, TraceEvent } from '../model';
import type { StepOptions } from '../steps';
import { busiest, callsTo, client, link, scenarioSteps, service } from './shared';

export const retriesBackoffCode = `async function callWithRetry(req) {
  for (let n = 0; ; n++) {
    if (n > 0) await sleep(backoff(n))     // wait before retry n
    try {
      const answer = await send(api, req)
      return answer
    } catch (err) {
      if (n === MAX_RETRIES) throw err      // out of tries
    }
  }
}

function backoff(n) {
  const delay = BASE_MS * 2 ** (n - 1)     // exponential: 50, 100, 200…
  return delay / 2 + random() * delay / 2  // jitter: spread the callers out
}`;

export const BACKOFFS = ['none', 'fixed', 'exponential'] as const;
const BASE_MS = 50;
/** Jitter uses the run's random numbers; a fixed seed makes every run of the same settings identical. */
const SEED = 7;

interface Settings {
  retries: number;
  backoff: RetryPolicy['backoff'];
  jitter: boolean;
  outage: number;
  requests: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const retries = readInt(values, 'retries', 'Retries', { min: 0, max: 4 });
  if (!retries.ok) return retries;
  const backoff = readChoice(values, 'backoff', 'Backoff', BACKOFFS);
  if (!backoff.ok) return backoff;
  const jitter = readChoice(values, 'jitter', 'Jitter', ['off', 'on']);
  if (!jitter.ok) return jitter;
  const outage = readInt(values, 'outage', 'Outage', { min: 0, max: 500 });
  if (!outage.ok) return outage;
  const requests = readInt(values, 'requests', 'Requests', { min: 1, max: 8 });
  if (!requests.ok) return requests;
  return {
    ok: true,
    value: { retries: retries.value, backoff: backoff.value as RetryPolicy['backoff'], jitter: jitter.value === 'on', outage: outage.value, requests: requests.value },
  };
}

export function retriesBackoffScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { retries, backoff, jitter, outage, requests } = settings.value;
  return {
    ok: true,
    value: {
      nodes: [client(), service('api', 1)],
      links: [link('client', 'api')],
      requests: Array.from({ length: requests }, () => ({ label: 'GET /price', path: '/price', to: 'api', at: 0 })),
      faults: outage > 0 ? [{ kind: 'outage', node: 'api', from: 0, until: outage, mode: 'refuse' }] : [],
      seed: SEED,
      ...(retries > 0 && { clientPolicy: { retry: { attempts: retries, backoff, baseMs: BASE_MS, jitter } } }),
    },
  };
}

/** When retries (every try after a request's first) reached api. */
export function retryArrivals(trace: TraceEvent[]): number[] {
  const seen = new Set<string>();
  return trace.flatMap((e) => {
    if (e.kind !== 'arrive' || e.message.kind !== 'request' || !e.message.request) return [];
    if (!seen.has(e.message.request)) {
      seen.add(e.message.request);
      return [];
    }
    return [e.t];
  });
}

export function retriesBackoffSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(retriesBackoffScenario(values), 'Check the settings', (result): StepOptions => {
    const calls = callsTo(result.trace, 'api');
    const retries = retryArrivals(result.trace);
    return {
      code: retriesBackoffCode,
      lines: { send: 'await send(api, req)', arrive: 'await send(api, req)', handle: 'await send(api, req)', fail: 'catch (err)', retry: 'await sleep(backoff(n))', done: 'return answer' },
      explain: (event) => {
        if (event.kind === 'done' && !event.ok) return { line: 'throw err' };
        if (event.kind === 'send' && event.message.kind === 'reply') return { line: event.message.ok ? 'return answer' : 'catch (err)' };
        return undefined;
      },
      variables: (event) => ({
        'calls to api': calls.filter((t) => t <= event.t).length,
        'busiest 10 ms of retries': busiest(retries.filter((t) => t <= event.t)),
      }),
    };
  });
}
