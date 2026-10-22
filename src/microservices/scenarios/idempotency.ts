import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { CallPolicy, Scenario } from '../model';
import type { StepOptions } from '../steps';
import { client, db, link, scenarioSteps, service } from './shared';

export const idempotencyCode = `// client: the same key on every try of one payment
async function pay(order) {
  const req = { key: order.id, amount: order.total }
  return callWithRetry(payments, req)   // at most once: no retry
}

// payments
async function handlePayment(req) {
  if (seen.has(req.key)) {
    return seen.get(req.key)            // already charged: answer again
  }
  const result = await ledger.charge(req.amount)
  seen.set(req.key, result)
  return result
}`;

const GAP_MS = 100;
const TIMEOUT_MS = 60;
export const DELIVERIES = ['at-most-once', 'at-least-once'] as const;

interface Settings {
  atLeastOnce: boolean;
  lost: boolean;
  keys: boolean;
  payments: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const delivery = readChoice(values, 'delivery', 'Delivery', DELIVERIES);
  if (!delivery.ok) return delivery;
  const lost = readChoice(values, 'lost', 'Lost reply', ['off', 'on']);
  if (!lost.ok) return lost;
  const keys = readChoice(values, 'keys', 'Idempotency key', ['off', 'on']);
  if (!keys.ok) return keys;
  const payments = readInt(values, 'payments', 'Payments', { min: 1, max: 5 });
  if (!payments.ok) return payments;
  return { ok: true, value: { atLeastOnce: delivery.value === 'at-least-once', lost: lost.value === 'on', keys: keys.value === 'on', payments: payments.value } };
}

export function idempotencyScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { atLeastOnce, lost, keys, payments } = settings.value;
  const policy: CallPolicy = atLeastOnce
    ? { timeoutMs: TIMEOUT_MS, retry: { attempts: 2, backoff: 'fixed', baseMs: 20, jitter: false } }
    : { timeoutMs: TIMEOUT_MS };
  return {
    ok: true,
    value: {
      nodes: [client(), service('payments', 1, ['ledger'], { dedupe: keys }), db('ledger', 2)],
      links: [link('client', 'payments'), link('payments', 'ledger')],
      requests: Array.from({ length: payments }, (_, i) => ({ label: 'POST /pay', path: '/pay', to: 'payments', at: i * GAP_MS })),
      faults: lost && payments >= 2 ? [{ kind: 'lose-reply', node: 'payments', request: '#2' }] : [],
      clientPolicy: policy,
    },
  };
}

export function idempotencySteps(values: Record<string, string>): Step[] {
  return scenarioSteps(idempotencyScenario(values), 'Check the settings', (result): StepOptions => {
    const charged = result.trace.flatMap((e) => (e.kind === 'arrive' && e.message.kind === 'query' ? [e] : []));
    return {
      code: idempotencyCode,
      lines: { handle: 'async function handlePayment(req)', duplicate: 'if (seen.has(req.key))', retry: 'return callWithRetry(payments, req)', timeout: 'return callWithRetry(payments, req)', done: 'async function pay(order)' },
      explain: (event) => {
        if (event.kind === 'send' && event.message.kind === 'query') return { line: 'ledger.charge(' };
        if (event.kind === 'send' && event.message.kind === 'reply' && event.message.from === 'payments-1') return { line: 'seen.set(req.key, result)' };
        if (event.kind === 'handle' && event.node === 'ledger') {
          const count = charged.filter((e) => e.t <= event.t).length;
          return { title: `The ledger charges the customer for ${event.request}`, line: 'ledger.charge(', why: `That makes ${count} charge${count === 1 ? '' : 's'} so far.` };
        }
        return undefined;
      },
      variables: (event) => ({ charges: charged.filter((e) => e.t <= event.t).length }),
    };
  });
}
