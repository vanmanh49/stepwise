import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { loadBalancingScenario, loadBalancingSteps } from './load-balancing';

const run = (values: Partial<Record<string, string>>) => {
  const read = loadBalancingScenario({ strategy: 'round-robin', instances: '3', slow: 'none', health: 'off', dead: 'none', ...values } as Record<string, string>);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const picks = (values: Partial<Record<string, string>>) => run(values).trace.flatMap((e) => (e.kind === 'pick' ? [e.instance] : []));
const count = (items: string[], id: string) => items.filter((x) => x === id).length;

describe('Load Balancing', () => {
  it('spreads round robin evenly', () => {
    const all = picks({});
    expect(['api-1', 'api-2', 'api-3'].map((id) => count(all, id))).toEqual([4, 4, 4]);
  });

  it('steers least connections away from a slow instance', () => {
    expect(count(picks({ strategy: 'least-connections', slow: 'api-1' }), 'api-1')).toBeLessThan(count(picks({ slow: 'api-1' }), 'api-1'));
  });

  it('stops picking a dead instance once a health check marks it down', () => {
    const { trace, requests } = run({ health: 'on', dead: 'last' });
    const mark = trace.find((e) => e.kind === 'mark' && !e.healthy)!;
    expect(mark).toMatchObject({ instance: 'api-3' });
    expect(trace.filter((e) => e.kind === 'pick' && e.instance === 'api-3' && e.t > mark.t)).toEqual([]);
    expect(requests.filter((r) => r.sentAt > mark.t).every((r) => r.status === 'ok')).toBe(true);
  });

  it('keeps sending to a dead instance without health checks', () => {
    // #3 is picked at 27 ms but reaches api-3 at 32 ms, after it died at 30 ms.
    expect(run({ dead: 'last' }).requests.filter((r) => r.status === 'failed').map((r) => r.id)).toEqual(['#3', '#6', '#9', '#12']);
  });

  it('picks the same instances for the same settings with random', () => {
    expect(picks({ strategy: 'random' })).toEqual(picks({ strategy: 'random' }));
  });

  it('refuses a single instance', () => {
    expect(loadBalancingSteps({ strategy: 'round-robin', instances: '1', slow: 'none', health: 'off', dead: 'none' })[0]!.why).toBe('Instances must be a whole number from 2 to 4.');
  });
});
