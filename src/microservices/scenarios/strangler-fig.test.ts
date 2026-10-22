import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { stranglerFigScenario, stranglerFigSteps } from './strangler-fig';

const values = (approach: string, migrated: string, bug: string, requests = '9') => ({ approach, migrated, bug, requests });
const run = (v: Record<string, string>) => {
  const read = stranglerFigScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).requests;
};

describe('Strangler Fig Migration', () => {
  it('sends everything to the monolith before anything moves', () => {
    expect(run(values('strangler', '0', 'none')).every((r) => r.hops.includes('monolith-1') && r.status === 'ok')).toBe(true);
  });

  it('moves two paths to new services behind the same addresses', () => {
    const requests = run(values('strangler', '2', 'none'));
    for (const r of requests) {
      if (r.label === 'GET /catalog') expect(r.hops).toContain('catalog-1');
      if (r.label === 'GET /orders') expect(r.hops).toContain('orders-1');
      if (r.label === 'GET /payments') expect(r.hops).toContain('monolith-1');
    }
    expect(requests.map((r) => r.label)).toEqual(run(values('strangler', '0', 'none')).map((r) => r.label));
    expect(stranglerFigSteps(values('strangler', '2', 'none')).at(-1)!.variables).toMatchObject({ 'monolith share': '33%' });
  });

  it('routes /orders back to the monolith when the new orders service is buggy', () => {
    for (const r of run(values('strangler', '2', 'new-orders'))) {
      const broken = r.label === 'GET /orders' && r.sentAt < 200;
      expect(r.status, `${r.label} at ${r.sentAt}`).toBe(broken ? 'failed' : 'ok');
    }
  });

  it('cannot go back after a big bang', () => {
    const orders = run(values('big-bang', '0', 'new-orders')).filter((r) => r.label === 'GET /orders');
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((r) => r.status === 'failed')).toBe(true);
  });

  it('refuses 4 moved paths', () => {
    expect(stranglerFigSteps(values('strangler', '4', 'none'))[0]!.why).toBe('Paths moved must be a whole number from 0 to 3.');
  });
});
