import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario } from '../model';
import type { StepOptions } from '../steps';
import { client, link, scenarioSteps, service } from './shared';

export const bulkheadCode = `const shared = new Pool(4)                // one pool for every call…
const recsPool = new Pool(2)              // …or one pool per dependency
const checkoutPool = new Pool(2)

async function callThrough(pool, service, req) {
  if (!pool.acquire()) {
    throw new BulkheadFull()              // no free slot: fail at once
  }
  try {
    return await send(service, req)       // holds the slot while it waits
  } finally {
    pool.release()                        // the slot is free again
  }
}`;

const GAP_MS = 10;
const SLOW_MS = 400;

interface Settings {
  separate: boolean;
  slow: boolean;
  requests: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const pools = readChoice(values, 'pools', 'Pools', ['shared', 'separate']);
  if (!pools.ok) return pools;
  const recs = readChoice(values, 'recs', 'Recommendations', ['normal', 'slow']);
  if (!recs.ok) return recs;
  const requests = readInt(values, 'requests', 'Requests', { min: 2, max: 12 });
  if (!requests.ok) return requests;
  return { ok: true, value: { separate: pools.value === 'separate', slow: recs.value === 'slow', requests: requests.value } };
}

export function bulkheadScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { separate, slow, requests } = settings.value;
  const pool = (name: string) => ({ bulkhead: separate ? { pool: name, size: 2 } : { pool: 'shared', size: 4 } });
  return {
    ok: true,
    value: {
      nodes: [
        client(),
        service('api', 1, [
          { to: 'recs', when: '/recs', policy: pool('recs') },
          { to: 'checkout', when: '/checkout', policy: pool('checkout') },
        ]),
        service('recs', 2, [], slow ? { processMs: SLOW_MS } : {}),
        service('checkout', 2),
      ],
      links: [link('client', 'api'), link('api', 'recs'), link('api', 'checkout')],
      requests: Array.from({ length: requests }, (_, i) =>
        i % 2 === 0 ? { label: 'GET /recs', path: '/recs', to: 'api', at: i * GAP_MS } : { label: 'POST /checkout', path: '/checkout', to: 'api', at: i * GAP_MS },
      ),
      faults: [],
    },
  };
}

export function bulkheadSteps(values: Record<string, string>): Step[] {
  const options: StepOptions = {
    code: bulkheadCode,
    lines: { handle: 'async function callThrough(', shed: 'throw new BulkheadFull()', done: 'return await send(service, req)' },
    explain: (event) => {
      if (event.kind === 'send' && event.message.from === 'api-1' && event.message.kind === 'request') return { line: 'return await send(service, req)' };
      if (event.kind === 'arrive' && event.message.to === 'api-1' && event.message.kind === 'reply') return { line: 'pool.release()' };
      if (event.kind === 'send' && event.message.from === 'api-1' && event.message.kind === 'reply') return { line: 'pool.release()' };
      if (event.kind === 'done' && !event.ok) return { line: 'throw new BulkheadFull()' };
      return undefined;
    },
  };
  return scenarioSteps(bulkheadScenario(values), 'Check the settings', options);
}
