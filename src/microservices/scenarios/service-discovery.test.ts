import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { serviceDiscoveryScenario, serviceDiscoverySteps } from './service-discovery';

const run = (values: Record<string, string>) => {
  const read = serviceDiscoveryScenario(values);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};

const settings = (instances: number, heartbeat: number, ttl: number, dies: number) => ({
  instances: String(instances),
  heartbeat: String(heartbeat),
  ttl: String(ttl),
  dies: String(dies),
});

describe('Service Discovery', () => {
  it('spreads looked-up requests over every registered instance', () => {
    const { requests } = run(settings(3, 20, 60, 0));
    expect(requests).toHaveLength(10);
    expect(requests.every((r) => r.status === 'ok')).toBe(true);
    expect(new Set(requests.map((r) => r.hops.find((h) => h.startsWith('orders-'))))).toEqual(new Set(['orders-1', 'orders-2', 'orders-3']));
  });

  it('fails requests to a dead instance only until the registry evicts it', () => {
    const { requests, trace } = run(settings(3, 20, 60, 50));
    const evict = trace.find((e) => e.kind === 'evict')!;
    expect(evict).toMatchObject({ t: 120, instance: 'orders-3' });
    const failed = requests.filter((r) => r.status === 'failed');
    expect(failed.some((r) => r.reason === 'orders-3 refused the connection')).toBe(true);
    for (const r of failed) {
      expect(r.reason).toMatch(/^orders-3 /);
      expect(r.sentAt).toBeLessThan(evict.t);
    }
    expect(requests.filter((r) => r.sentAt >= evict.t).every((r) => r.status === 'ok')).toBe(true);
  });

  it('fails fewer requests with a shorter TTL', () => {
    const failures = (ttl: number) => run(settings(3, 20, ttl, 50)).requests.filter((r) => r.status === 'failed').length;
    expect(failures(25)).toBeLessThan(failures(60));
  });

  it('refuses a TTL shorter than the heartbeat interval', () => {
    const steps = serviceDiscoverySteps(settings(3, 50, 20, 0));
    expect(steps).toHaveLength(1);
    expect(steps[0]!.why).toBe('The TTL (20 ms) must be at least the heartbeat interval (50 ms), or the registry would drop live instances between heartbeats.');
  });
});
