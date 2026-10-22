import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Call, Fault, Scenario, SimResult, TraceEvent } from '../model';
import type { StepOptions } from '../steps';
import { broker, client, db, link, relayNode, scenarioSteps, service } from './shared';

export const transactionalOutboxCode = `// orders: save the order and its event in ONE local transaction
async function placeOrder(req) {
  await db.transaction(async (tx) => {
    await tx.insert('orders', req.order)
    await tx.insert('outbox', { event: 'OrderPlaced', order: req.order })
  })
  return accepted                          // no broker call here
}

// relay: a separate loop that publishes what the outbox holds
async function poll() {
  for (const row of await db.select('outbox')) {
    await broker.publish(row.event, row.order)
    await db.delete('outbox', row.id)        // only after the broker stored it
  }
  setTimeout(poll, 40)
}

// the dual write it replaces: two systems, no shared transaction
//   await db.insert('orders', order)
//   await broker.publish('OrderPlaced', order)`;

export const APPROACHES = ['save-then-publish', 'publish-then-save', 'outbox'] as const;
export const FAULTS = ['none', 'crash', 'db-down'] as const;
const GAP_MS = 50;
const POLL_MS = 40;
const RESTART_MS = 10;
const DB_DOWN_AT = 60;

interface Settings {
  approach: (typeof APPROACHES)[number];
  fault: (typeof FAULTS)[number];
  orders: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const approach = readChoice(values, 'approach', 'Approach', APPROACHES);
  if (!approach.ok) return approach;
  const fault = readChoice(values, 'fault', 'Fault', FAULTS);
  if (!fault.ok) return fault;
  const orders = readInt(values, 'orders', 'Orders', { min: 1, max: 5 });
  if (!orders.ok) return orders;
  return { ok: true, value: { approach: approach.value as Settings['approach'], fault: fault.value as Settings['fault'], orders: orders.value } };
}

export function transactionalOutboxScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { approach, fault, orders } = settings.value;
  const save: Call = { to: 'orders-db', data: { write: { 'order {req}': 'placed' } } };
  const publish: Call = { to: 'events', label: 'OrderPlaced' };
  const calls: Call[] =
    approach === 'save-then-publish'
      ? [save, publish]
      : approach === 'publish-then-save'
        ? [publish, save]
        : [{ to: 'orders-db', data: { write: { 'order {req}': 'placed', 'outbox/{req}': 'OrderPlaced' } } }];
  const faults: Fault[] =
    fault === 'crash'
      ? [{ kind: 'crash-after', node: 'orders', after: calls[0]!.to, request: '#2', restartMs: RESTART_MS }]
      : fault === 'db-down'
        ? [{ kind: 'down', node: 'orders-db', at: DB_DOWN_AT }]
        : [];
  const outbox = approach === 'outbox';
  return {
    ok: true,
    value: {
      nodes: [
        client(),
        service('orders', 1, calls),
        db('orders-db', 2),
        ...(outbox ? [relayNode('relay', 2, 'orders-db', 'events', POLL_MS)] : []),
        broker('events', 3, 'queue', ['email']),
        service('email', 4),
      ],
      links: [
        link('client', 'orders'),
        link('orders', 'orders-db'),
        link('orders', 'events'),
        link('events', 'email'),
        ...(outbox ? [link('relay', 'orders-db'), link('relay', 'events')] : []),
      ],
      requests: Array.from({ length: orders }, (_, i) => ({ label: 'POST /orders', path: '/orders', to: 'orders', at: i * GAP_MS })),
      faults,
    },
  };
}

/** Orders saved in orders-db, and events the broker stored, by the event being shown. */
function counts(result: SimResult, upTo: TraceEvent): { saved: number; published: number } {
  const saved = new Set<string>();
  let published = 0;
  for (const e of result.trace.slice(0, result.trace.indexOf(upTo) + 1)) {
    if (e.kind === 'write' && e.db === 'orders-db') for (const [key, value] of Object.entries(e.records)) if (key.startsWith('order ') && value !== null) saved.add(key);
    if (e.kind === 'store') published++;
  }
  return { saved: saved.size, published };
}

export function transactionalOutboxSteps(values: Record<string, string>): Step[] {
  const outbox = values.approach === 'outbox';
  const options = (result: SimResult): StepOptions => ({
    code: transactionalOutboxCode,
    lines: { handle: 'async function placeOrder(req)', poll: 'async function poll()', store: 'broker.publish(row.event', done: 'return accepted' },
    explain: (event) => {
      if (event.kind === 'write' && event.db === 'orders-db') {
        if (Object.values(event.records).includes(null)) return { line: "await db.delete('outbox', row.id)" };
        return { line: outbox ? 'db.transaction(' : "//   await db.insert('orders', order)" };
      }
      if (event.kind === 'send' && event.message.kind === 'request' && event.message.from === 'orders-1' && event.message.to === 'events') {
        return { line: "//   await broker.publish('OrderPlaced', order)" };
      }
      if (event.kind === 'send' && event.message.from === 'relay' && event.message.to === 'events') return { line: 'broker.publish(row.event' };
      if (event.kind === 'store' && !outbox) return { line: "//   await broker.publish('OrderPlaced', order)" };
      return undefined;
    },
    variables: (event) => counts(result, event),
  });
  return scenarioSteps(transactionalOutboxScenario(values), 'Check the settings', options);
}
