import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { deploymentStrategiesScenario, deploymentStrategiesSteps } from './deployment-strategies';

const values = (strategy: string, v2: string, requests = '12') => ({ strategy, v2, requests });
const run = (v: Record<string, string>) => {
  const read = deploymentStrategiesScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const failedAt = (v: Record<string, string>) => run(v).requests.flatMap((r) => (r.status === 'failed' ? [r.sentAt] : []));

describe('Deployment Strategies', () => {
  it('has downtime between stopping v1 and starting v2 with recreate', () => {
    const result = run(values('recreate', 'healthy'));
    expect(failedAt(values('recreate', 'healthy'))).toEqual([120, 160, 200]);
    expect(result.requests.find((r) => r.sentAt === 120)!.reason).toBe('no healthy app instance');
  });

  it('exposes more requests to a buggy v2 as a rolling update goes on', () => {
    const failed = failedAt(values('rolling', 'buggy'));
    expect(failed.every((t) => t >= 100)).toBe(true);
    const early = failed.filter((t) => t >= 100 && t < 220).length;
    const late = failed.filter((t) => t >= 340 && t < 480).length;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThanOrEqual(late);
  });

  it('fails everything between the switch and the switch back with blue-green', () => {
    const result = run(values('blue-green', 'buggy'));
    for (const r of result.requests) expect(r.status, `${r.sentAt}`).toBe(r.sentAt >= 200 && r.sentAt < 320 ? 'failed' : 'ok');
  });

  it('rolls a buggy canary back after 2 errors', () => {
    const result = run(values('canary', 'buggy'));
    expect(result.requests.filter((r) => r.status === 'failed')).toHaveLength(2);
    const rollback = result.trace.filter((e) => e.kind === 'rollback');
    expect(rollback).toHaveLength(1);
    expect(result.trace.some((e) => e.kind === 'pick' && e.t > rollback[0]!.t && e.instance === 'app-4')).toBe(false);
  });

  it('serves every request in a healthy rolling update', () => {
    expect(failedAt(values('rolling', 'healthy'))).toEqual([]);
  });

  it('counts requests served by each version and errors', () => {
    const last = deploymentStrategiesSteps(values('canary', 'buggy')).at(-1)!.variables!;
    expect(last.errors).toBe(2);
    expect(last['served by v1/v2']).toMatch(/^\d+ \/ \d+$/);
  });

  it('refuses 5 requests', () => {
    expect(deploymentStrategiesSteps(values('recreate', 'healthy', '5'))[0]!.why).toBe('Requests must be a whole number from 6 to 16.');
  });
});
