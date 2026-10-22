import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { RequestSpec, Scenario, SimResult, TraceEvent } from '../model';
import type { StepOptions } from '../steps';
import { broker, client, db, link, scenarioSteps, service } from './shared';

export const cqrsCode = `// command side: change the order, then tell the read side
async function handleCommand(cmd) {
  await ordersDb.update(cmd.orderId, cmd.status)
  await publish('OrderUpdated', cmd)
}

// projector: keeps the read model up to date, in its own time
on('OrderUpdated', async (event) => {
  await viewDb.put(event.orderId, summaryOf(event))
})

// query side: one lookup, already shaped for the screen
async function handleQuery(q) {
  const view = await viewDb.get(q.orderId)
  return view
}

// single model: every read joins three services
//   const order = await ordersDb.get(id)
//   const user = await users.get(order.userId)
//   const items = await products.get(order.items)`;

const KEY = 'order 42';
export const STATUSES = ['placed', 'paid', 'shipped'];
const WRITE_GAP_MS = 150;

interface Settings {
  cqrs: boolean;
  readDelay: number;
  projector: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const model = readChoice(values, 'model', 'Model', ['single', 'cqrs']);
  if (!model.ok) return model;
  const readDelay = readInt(values, 'readDelay', 'Read delay', { min: 0, max: 140 });
  if (!readDelay.ok) return readDelay;
  const projector = readInt(values, 'projector', 'Projector time', { min: 10, max: 300 });
  if (!projector.ok) return projector;
  return { ok: true, value: { cqrs: model.value === 'cqrs', readDelay: readDelay.value, projector: projector.value } };
}

export function cqrsScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { cqrs, readDelay, projector } = settings.value;
  const requests: RequestSpec[] = STATUSES.flatMap((value, i) => [
    { label: 'PUT /orders/42', path: 'PUT /orders/42', to: 'orders', at: i * WRITE_GAP_MS, key: KEY, value },
    { label: 'GET /orders/42', path: 'GET /orders/42', to: cqrs ? 'query' : 'orders', at: i * WRITE_GAP_MS + readDelay, key: KEY },
  ]);
  const write = { to: 'orders-db', when: 'PUT', data: { write: { '{key}': '{value}' } } };
  const scenario: Scenario = cqrs
    ? {
        nodes: [
          client(),
          service('orders', 1, [write, { to: 'events', when: 'PUT', label: 'OrderUpdated' }]),
          service('query', 1, [{ to: 'view-db', data: { read: '{key}' } }]),
          db('orders-db', 2),
          broker('events', 2, 'queue', ['projector']),
          service('projector', 3, [{ to: 'view-db', data: { write: { '{key}': '{value}' } } }], { processMs: projector }),
          db('view-db', 4),
        ],
        links: [
          link('client', 'orders'),
          link('client', 'query'),
          link('orders', 'orders-db'),
          link('orders', 'events'),
          link('events', 'projector'),
          link('projector', 'view-db'),
          link('query', 'view-db'),
        ],
        requests,
        faults: [],
      }
    : {
        nodes: [
          client(),
          service('orders', 1, [write, { to: 'orders-db', when: 'GET', data: { read: '{key}' } }, { to: 'users', when: 'GET' }, { to: 'products', when: 'GET' }]),
          db('orders-db', 2),
          service('users', 2, ['users-db']),
          service('products', 2, ['products-db']),
          db('users-db', 3),
          db('products-db', 3),
        ],
        links: [
          link('client', 'orders'),
          link('orders', 'orders-db'),
          link('orders', 'users'),
          link('orders', 'products'),
          link('users', 'users-db'),
          link('products', 'products-db'),
        ],
        requests,
        faults: [],
      };
  return { ok: true, value: scenario };
}

/** Reads finished so far whose value isn't the status of the last write sent before them. */
function staleReads(scenario: Scenario, result: SimResult, upTo: TraceEvent): number {
  const done = new Set(result.trace.slice(0, result.trace.indexOf(upTo) + 1).flatMap((e) => (e.kind === 'done' ? [e.request] : [])));
  return result.requests.filter((r, i) => {
    if (!r.label.startsWith('GET') || !done.has(r.id)) return false;
    const latest = scenario.requests.filter((q) => q.label.startsWith('PUT') && q.at <= scenario.requests[i]!.at).at(-1);
    return r.value !== latest?.value;
  }).length;
}

export function cqrsSteps(values: Record<string, string>): Step[] {
  const scenario = cqrsScenario(values);
  const options = (result: SimResult): StepOptions => ({
    code: cqrsCode,
    lines: { handle: 'async function handleCommand(cmd)', delivered: "on('OrderUpdated'", done: 'return view' },
    explain: (event) => {
      if (event.kind === 'write') return { line: event.db === 'view-db' ? 'await viewDb.put(' : 'await ordersDb.update(' };
      if (event.kind === 'read') return { line: event.db === 'view-db' ? 'const view = await viewDb.get(' : 'const order = await ordersDb.get(id)' };
      if (event.kind === 'handle' && event.node === 'users') return { line: 'const user = await users.get(' };
      if (event.kind === 'handle' && event.node === 'products') return { line: 'const items = await products.get(' };
      if (event.kind === 'handle' && event.node === 'query') return { line: 'async function handleQuery(q)' };
      if (event.kind === 'store') return { line: "await publish('OrderUpdated', cmd)" };
      return undefined;
    },
    variables: (event) => ({ 'stale reads': scenario.ok ? staleReads(scenario.value, result, event) : 0 }),
  });
  return scenarioSteps(scenario, 'Check the settings', options);
}
