import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Call, Fault, Scenario, SimResult, TraceEvent } from '../model';
import type { StepOptions } from '../steps';
import { client, db, link, scenarioSteps, service } from './shared';

export const sagaCode = `// orders: the saga orchestrator
async function placeOrder(order) {
  const done = []
  for (const step of steps) {              // save, pay, reserve
    try {
      await step.run(order)
      done.push(step)
    } catch (error) {
      for (const step of done.reverse()) {
        await step.compensate(order)        // cancel, refund, release
      }
      throw error
    }
  }
  await db.save(order.id, 'confirmed')
  return 'confirmed'
}

const steps = [
  { run: (o) => db.save(o.id, 'pending'), compensate: (o) => db.save(o.id, 'cancelled') },
  { run: (o) => payments.pay(o), compensate: (o) => payments.refund(o) },
  { run: (o) => inventory.reserve(o), compensate: (o) => inventory.release(o) },
]`;

export const FAILURES = ['none', 'payment', 'inventory'] as const;
const GAP_MS = 60;
/** The order whose step fails. */
const FAILING = '#2';

interface Settings {
  saga: boolean;
  fails: (typeof FAILURES)[number];
  orders: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const saga = readChoice(values, 'saga', 'Saga', ['off', 'on']);
  if (!saga.ok) return saga;
  const fails = readChoice(values, 'fails', 'Failing step', FAILURES);
  if (!fails.ok) return fails;
  const orders = readInt(values, 'orders', 'Orders', { min: 1, max: 4 });
  if (!orders.ok) return orders;
  return { ok: true, value: { saga: saga.value === 'on', fails: fails.value as Settings['fails'], orders: orders.value } };
}

export function sagaScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { saga, fails, orders } = settings.value;
  const undo = (compensate: Call): { compensate?: Call } => (saga ? { compensate } : {});
  const steps: Call[] = [
    { to: 'orders-db', data: { write: { 'order {req}': 'pending' } }, ...undo({ to: 'orders-db', data: { write: { 'order {req}': 'cancelled' } } }) },
    { to: 'payments', path: '/pay', ...undo({ to: 'payments', path: '/refund' }) },
    { to: 'inventory', path: '/reserve', ...undo({ to: 'inventory', path: '/release' }) },
    { to: 'orders-db', data: { write: { 'order {req}': 'confirmed' } } },
  ];
  const faults: Fault[] =
    fails === 'none'
      ? []
      : [{ kind: 'errors', node: fails === 'payment' ? 'payments' : 'inventory', rate: 1, request: FAILING, reason: fails === 'payment' ? 'card declined' : 'out of stock' }];
  return {
    ok: true,
    value: {
      nodes: [
        client(),
        service('orders', 1, steps),
        db('orders-db', 2),
        service('payments', 2, [
          { to: 'payments-db', when: '/pay', data: { write: { 'charge {req}': 'charged' } } },
          { to: 'payments-db', when: '/refund', data: { write: { 'charge {req}': 'refunded' } } },
        ]),
        service('inventory', 2, [
          { to: 'inventory-db', when: '/reserve', data: { write: { 'reserve {req}': 'held' } } },
          { to: 'inventory-db', when: '/release', data: { write: { 'reserve {req}': 'released' } } },
        ]),
        db('payments-db', 3),
        db('inventory-db', 3),
      ],
      links: [link('client', 'orders'), link('orders', 'orders-db'), link('orders', 'payments'), link('orders', 'inventory'), link('payments', 'payments-db'), link('inventory', 'inventory-db')],
      requests: Array.from({ length: orders }, (_, i) => ({ label: 'POST /orders', path: '/orders', to: 'orders', at: i * GAP_MS })),
      faults,
    },
  };
}

/** Failed orders so far that were left half done: not cancelled, or still charged. */
function inconsistent(result: SimResult, upTo: TraceEvent): number {
  const records = new Map<string, string>();
  const failed: string[] = [];
  for (const e of result.trace.slice(0, result.trace.indexOf(upTo) + 1)) {
    if (e.kind === 'write') for (const [key, value] of Object.entries(e.records)) if (value !== null) records.set(key, value);
    if (e.kind === 'done' && !e.ok) failed.push(e.request);
  }
  return failed.filter((id) => records.get(`order ${id}`) !== 'cancelled' || records.get(`charge ${id}`) === 'charged').length;
}

export function sagaSteps(values: Record<string, string>): Step[] {
  const scenario = sagaScenario(values);
  const saga = values.saga === 'on';
  const options = (result: SimResult): StepOptions => ({
    code: sagaCode,
    lines: { handle: 'async function placeOrder(order)', compensate: 'await step.compensate(order)', done: "return 'confirmed'", fail: 'catch (error)' },
    explain: (event) => {
      if (event.kind === 'write' && event.db === 'orders-db') {
        const status = Object.values(event.records)[0];
        return { line: status === 'confirmed' ? "await db.save(order.id, 'confirmed')" : status === 'cancelled' ? "compensate: (o) => db.save(o.id, 'cancelled')" : "run: (o) => db.save(o.id, 'pending')" };
      }
      if (event.kind === 'write' && event.db === 'payments-db') return { line: Object.values(event.records)[0] === 'refunded' ? 'payments.refund(o)' : 'payments.pay(o)' };
      if (event.kind === 'write' && event.db === 'inventory-db') return { line: Object.values(event.records)[0] === 'released' ? 'inventory.release(o)' : 'inventory.reserve(o)' };
      if (event.kind === 'done' && !event.ok) {
        if (saga) return { line: 'throw error', why: `Reason: ${event.reason ?? 'unknown'}. Every step that had already succeeded was undone first.` };
        // Only a charge that was actually written stays taken; a declined card never charged.
        const charged = result.trace.some((e) => e.kind === 'write' && e.db === 'payments-db' && e.records[`charge ${event.request}`] === 'charged' && e.t <= event.t);
        const left = charged ? 'the order stays pending and the payment stays taken' : 'the order stays pending';
        return { line: 'throw error', why: `Reason: ${event.reason ?? 'unknown'}. Nothing undoes the steps that already happened, so ${left}.` };
      }
      return undefined;
    },
    variables: (event) => ({ 'inconsistent orders': inconsistent(result, event) }),
  });
  return scenarioSteps(scenario, 'Check the settings', options);
}
