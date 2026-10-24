import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { ingressScenario, ingressSteps } from './ingress';

const base = { apiPathType: 'Prefix', defaultBackend: 'none', apiReplicas: '1', controller: 'on' };
const results = (values: Partial<typeof base>) => {
  const read = ingressScenario({ ...base, ...values });
  if (!read.ok) throw new Error(read.why);
  return Object.fromEntries(simulate(read.value).final!.requests.map((r) => [`${r.host}${r.path}`, r.status === 'ok' ? r.service : r.reason]));
};

describe('Ingress', () => {
  it('routes by host and path, matching whole path elements', () => {
    expect(results({})).toEqual({
      'shop.example.com/': 'web',
      'shop.example.com/api/cart': 'api',
      'shop.example.com/apiary': 'web',
      'shop.example.com/api': 'api',
      'admin.example.com/': '404 Not Found',
    });
  });

  it('only matches /api itself with Exact', () => {
    const r = results({ apiPathType: 'Exact' });
    expect(r['shop.example.com/api']).toBe('api');
    expect(r['shop.example.com/api/cart']).toBe('web');
  });

  it('sends an unknown host to the default backend when there is one', () => {
    expect(results({ defaultBackend: 'web' })['admin.example.com/']).toBe('web');
  });

  it('answers 503 when the matched Service has no ready pods', () => {
    expect(results({ apiReplicas: '0' })['shop.example.com/api/cart']).toBe('503 Service Unavailable');
  });

  it('refuses every request without an ingress controller', () => {
    expect(new Set(Object.values(results({ controller: 'off' })))).toEqual(new Set(['connection refused: no ingress controller is running']));
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ apiReplicas: '3' }, { apiPathType: 'Regex' }, { controller: 'maybe' }]) {
      const steps = ingressSteps({ ...base, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't set up this Ingress");
    }
  });
});
