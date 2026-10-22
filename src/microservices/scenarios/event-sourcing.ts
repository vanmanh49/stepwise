import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario, SimResult, TraceEvent } from '../model';
import type { StepOptions } from '../steps';
import { client, db, link, PER_EVENT_MS, scenarioSteps, service } from './shared';

export const eventSourcingCode = `// state store: overwrite the balance; the history is gone
async function applyToState(amount) {
  await db.add('balance', amount)
}

// event store: append what happened, never overwrite
async function record(amount) {
  await events.append({ type: 'Changed', amount })
  if (events.length % 5 === 0) saveSnapshot(total())
}

// the balance is worked out from the history
function balance() {
  const snap = latestSnapshot()            // or zero
  let total = snap.value
  for (const e of events.after(snap)) total += e.amount
  return total
}`;

export const VALUES = ['+50', '-20', '+100', '-30', '+10', '+20'];
export const SNAPSHOTS = ['off', 'every-5'] as const;
const GAP_MS = 20;

interface Settings {
  events: boolean;
  operations: number;
  snapshots: boolean;
}

function read(values: Record<string, string>): Read<Settings> {
  const store = readChoice(values, 'store', 'Store', ['state', 'events']);
  if (!store.ok) return store;
  const operations = readInt(values, 'operations', 'Operations', { min: 2, max: 20 });
  if (!operations.ok) return operations;
  const snapshot = readChoice(values, 'snapshot', 'Snapshots', SNAPSHOTS);
  if (!snapshot.ok) return snapshot;
  return { ok: true, value: { events: store.value === 'events', operations: operations.value, snapshots: snapshot.value === 'every-5' } };
}

export function eventSourcingScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { events, operations, snapshots } = settings.value;
  return {
    ok: true,
    value: {
      nodes: [
        client(),
        service('account', 1, [
          { to: 'account-db', when: 'POST', data: events ? { append: '{value}' } : { add: { balance: '{value}' } } },
          { to: 'account-db', when: 'GET', data: { read: 'balance' } },
        ]),
        db('account-db', 2, [], events ? { events: { perEventMs: PER_EVENT_MS, ...(snapshots && { snapshotEvery: 5 }) } } : {}),
      ],
      links: [link('client', 'account'), link('account', 'account-db')],
      requests: [
        ...Array.from({ length: operations }, (_, i) => ({ label: 'POST /account', path: 'POST /account', to: 'account', at: i * GAP_MS, value: VALUES[i % VALUES.length]! })),
        { label: 'GET /balance', path: 'GET /balance', to: 'account', at: operations * GAP_MS },
      ],
      faults: [],
    },
  };
}

/** Events the latest read so far had to replay. */
function lastReplay(result: SimResult, upTo: TraceEvent): number {
  const reads = result.trace.slice(0, result.trace.indexOf(upTo) + 1).filter((e) => e.kind === 'read');
  const last = reads.at(-1);
  return last?.kind === 'read' ? (last.replayed ?? 0) : 0;
}

export function eventSourcingSteps(values: Record<string, string>): Step[] {
  const scenario = eventSourcingScenario(values);
  const options = (result: SimResult): StepOptions => ({
    code: eventSourcingCode,
    lines: { append: 'await events.append(', snapshot: 'saveSnapshot(total())', write: "await db.add('balance', amount)", read: 'function balance()', done: 'return total' },
    explain: (event) => {
      if (event.kind === 'read' && event.replayed === undefined) return { line: "await db.add('balance', amount)", why: 'The state store keeps one number. It answers at once, but it can\'t say how it got there.' };
      if (event.kind === 'read') return { line: 'for (const e of events.after(snap))' };
      return undefined;
    },
    variables: (event) => ({ 'events replayed': lastReplay(result, event) }),
  });
  return scenarioSteps(scenario, 'Check the settings', options);
}
