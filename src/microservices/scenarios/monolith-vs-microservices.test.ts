import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { monolithVsMicroservicesScenario, monolithVsMicroservicesSteps } from './monolith-vs-microservices';

const outcomes = (values: Record<string, string>) => {
  const read = monolithVsMicroservicesScenario(values);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).requests;
};

describe('Monolith vs Microservices', () => {
  it('takes longer to answer GET /products split than in one process', () => {
    const [monolith] = outcomes({ architecture: 'monolith', bug: 'off', requests: '4' });
    const [split] = outcomes({ architecture: 'microservices', bug: 'off', requests: '4' });
    expect(monolith).toMatchObject({ label: 'GET /products', status: 'ok' });
    expect(split).toMatchObject({ label: 'GET /products', status: 'ok' });
    expect(split!.ms).toBeGreaterThan(monolith!.ms);
    expect(split!.hops.length).toBeGreaterThan(monolith!.hops.length);
  });

  it('loses every request from the crash on when the monolith hits the reviews bug', () => {
    const requests = outcomes({ architecture: 'monolith', bug: 'on', requests: '4' });
    expect(requests.map((r) => [r.status, r.reason])).toEqual([
      ['ok', undefined],
      ['failed', 'app-1 crashed'],
      ['failed', 'app-1 refused the connection'],
      ['failed', 'app-1 refused the connection'],
    ]);
  });

  it('loses only /reviews when the split system hits the same bug', () => {
    const requests = outcomes({ architecture: 'microservices', bug: 'on', requests: '6' });
    for (const r of requests) expect(r.status, r.label).toBe(r.label === 'GET /reviews' ? 'failed' : 'ok');
  });

  it('refuses a request count outside 1 to 8', () => {
    const steps = monolithVsMicroservicesSteps({ architecture: 'monolith', bug: 'off', requests: '0' });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.why).toBe('Requests must be a whole number from 1 to 8.');
  });
});
