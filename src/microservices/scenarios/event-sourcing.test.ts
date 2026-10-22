import { describe, expect, it } from 'vitest';
import { finalRecords } from '../records.testutil';
import { simulate } from '../sim';
import { eventSourcingScenario, eventSourcingSteps } from './event-sourcing';

const values = (store: string, operations = '8', snapshot = 'off') => ({ store, operations, snapshot });
const run = (v: Record<string, string>) => {
  const read = eventSourcingScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const replayed = (v: Record<string, string>) => {
  const read = run(v).trace.find((e) => e.kind === 'read');
  return read?.kind === 'read' ? read.replayed : undefined;
};

describe('Event Sourcing', () => {
  it('keeps only the balance in a state store', () => {
    const result = run(values('state'));
    expect(result.requests.at(-1)).toMatchObject({ status: 'ok', value: '160' });
    expect(finalRecords(result, 'account-db')).toEqual({ balance: '160' });
  });

  it('keeps every event in an event store and replays them on read', () => {
    const v = values('events');
    const result = run(v);
    expect(result.requests.at(-1)!.value).toBe('160');
    expect(result.trace.filter((e) => e.kind === 'append')).toHaveLength(8);
    expect(replayed(v)).toBe(8);
    expect(eventSourcingSteps(v).at(-1)!.variables).toMatchObject({ 'events replayed': 8 });
  });

  it('reads 20 events 40 ms slower than the state store', () => {
    const [events, state] = [run(values('events', '20')), run(values('state', '20'))];
    expect(events.requests.at(-1)!.ms - state.requests.at(-1)!.ms).toBe(40);
  });

  it('replays only the events after the latest snapshot', () => {
    const v = values('events', '18', 'every-5');
    expect(replayed(v)).toBe(3);
    expect(finalRecords(run(v), 'account-db')).toHaveProperty(['snapshot @15']);
  });

  it('refuses 1 operation', () => {
    expect(eventSourcingSteps(values('state', '1'))[0]!.why).toBe('Operations must be a whole number from 2 to 20.');
  });
});
