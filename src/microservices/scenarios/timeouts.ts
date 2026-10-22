import { readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario } from '../model';
import type { StepOptions } from '../steps';
import { client, link, scenarioSteps, service } from './shared';

export const timeoutsCode = `async function handle(req) {
  try {
    const stock = await callWithTimeout(inventory, req, TIMEOUT_MS)
    return reply(stock)
  } catch (err) {
    return fail(req, err)          // fail fast: the caller is free again
  }
}

function callWithTimeout(service, req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject('timed out'), ms)
    send(service, req).then((answer) => {
      clearTimeout(timer)
      resolve(answer)              // too late? the promise already failed
    })
  })
}`;

/** One request every this many ms. */
const GAP_MS = 100;

interface Settings {
  inventory: number;
  apiTimeout: number;
  clientTimeout: number;
  requests: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const inventory = readInt(values, 'inventory', 'Inventory time', { min: 10, max: 1000 });
  if (!inventory.ok) return inventory;
  const apiTimeout = readInt(values, 'apiTimeout', 'API timeout', { min: 0, max: 2000 });
  if (!apiTimeout.ok) return apiTimeout;
  const clientTimeout = readInt(values, 'clientTimeout', 'Client timeout', { min: 0, max: 2000 });
  if (!clientTimeout.ok) return clientTimeout;
  const requests = readInt(values, 'requests', 'Requests', { min: 1, max: 4 });
  if (!requests.ok) return requests;
  return { ok: true, value: { inventory: inventory.value, apiTimeout: apiTimeout.value, clientTimeout: clientTimeout.value, requests: requests.value } };
}

export function timeoutsScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { inventory, apiTimeout, clientTimeout, requests } = settings.value;
  return {
    ok: true,
    value: {
      nodes: [
        client(),
        service('api', 1, [{ to: 'inventory', ...(apiTimeout > 0 && { policy: { timeoutMs: apiTimeout } }) }]),
        service('inventory', 2, [], { processMs: inventory }),
      ],
      links: [link('client', 'api'), link('api', 'inventory')],
      requests: Array.from({ length: requests }, (_, i) => ({ label: 'GET /stock', path: '/stock', to: 'api', at: i * GAP_MS })),
      faults: [],
      ...(clientTimeout > 0 && { clientPolicy: { timeoutMs: clientTimeout } }),
    },
  };
}

export function timeoutsSteps(values: Record<string, string>): Step[] {
  const options: StepOptions = {
    code: timeoutsCode,
    lines: { handle: 'async function handle(req)', send: 'send(service, req)', timeout: 'setTimeout', late: '// too late', done: 'return reply(stock)' },
    explain: (event) => {
      if (event.kind === 'send' && event.message.kind === 'reply') {
        if (event.message.from === 'api-1') return { line: event.message.ok ? 'return reply(stock)' : 'return fail(req, err)' };
        return { line: 'resolve(answer)' };
      }
      if (event.kind === 'send' && event.message.from === 'api-1') return { line: 'callWithTimeout(inventory' };
      if (event.kind === 'done' && !event.ok) return { line: 'return fail(req, err)' };
      if (event.kind === 'done' && event.ok) {
        return { why: `The answer is back after ${event.ms} ms. Nobody gave up, so the client waited for every millisecond inventory took.` };
      }
      return undefined;
    },
  };
  return scenarioSteps(timeoutsScenario(values), 'Check the settings', options);
}
