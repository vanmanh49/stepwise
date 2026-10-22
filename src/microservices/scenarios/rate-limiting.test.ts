import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { rateLimitingScenario, rateLimitingSteps } from './rate-limiting';

const values = (algorithm: string, traffic: string, per = 'all', limit = '5') => ({ algorithm, limit, per, traffic });
const run = (v: Record<string, string>) => {
  const read = rateLimitingScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).requests;
};
const ok = (rs: ReturnType<typeof run>) => rs.filter((r) => r.status === 'ok').length;
const of = (rs: ReturnType<typeof run>, caller: string) => rs.filter((r) => r.label.endsWith(`(${caller})`));

describe('Rate Limiting', () => {
  it('lets steady traffic through', () => {
    expect(ok(run(values('fixed-window', 'steady')))).toBe(10);
  });

  it('lets twice the limit through at a fixed-window edge', () => {
    expect(ok(run(values('fixed-window', 'edge')))).toBe(10);
  });

  it('smooths the edge with a token bucket', () => {
    const requests = run(values('token-bucket', 'edge'));
    expect(ok(requests)).toBe(6);
    expect(requests.filter((r) => r.reason === '429: rate limit')).toHaveLength(4);
  });

  it('lets a noisy caller use up a shared limit', () => {
    expect(of(run(values('fixed-window', 'noisy')), 'alice')[1]).toMatchObject({ status: 'failed', reason: '429: rate limit' });
  });

  it('protects alice with a limit per caller', () => {
    const requests = run(values('fixed-window', 'noisy', 'caller'));
    expect(of(requests, 'alice').every((r) => r.status === 'ok')).toBe(true);
    expect(ok(of(requests, 'bob'))).toBe(5);
    expect(of(requests, 'bob').filter((r) => r.reason === '429: rate limit')).toHaveLength(3);
  });

  it('refuses a limit of 0', () => {
    expect(rateLimitingSteps(values('fixed-window', 'steady', 'all', '0'))[0]!.why).toBe('Limit must be a whole number from 1 to 10.');
  });
});
