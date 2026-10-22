import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { serviceMeshScenario, serviceMeshSteps } from './service-mesh';

const values = (mesh: string, retries = '2', mtls = 'off', requests = '8') => ({ mesh, retries, mtls, requests });
const run = (v: Record<string, string>) => {
  const read = serviceMeshScenario(v);
  if (!read.ok) throw new Error(read.why);
  return { scenario: read.value, result: simulate(read.value) };
};
const orders = (v: Record<string, string>) => run(v).result.requests.filter((r) => r.label.startsWith('POST'));
const scraper = (v: Record<string, string>) => run(v).result.requests.find((r) => r.label.startsWith('GET'))!;
const flaky = (v: Record<string, string>) => orders(v).filter((r) => r.reason === '500: flaky').length;

describe('Sidecar & Service Mesh', () => {
  it('fails some orders on flaky payments without a mesh, and lets the scraper in', () => {
    expect(flaky(values('off'))).toBeGreaterThanOrEqual(1);
    expect(scraper(values('off')).hops).toContain('payments-1');
  });

  it('retries in the sidecars without touching the app code', () => {
    expect(orders(values('on')).filter((r) => r.status === 'failed').length).toBeLessThan(orders(values('off')).filter((r) => r.status === 'failed').length);
    const ordersNode = (v: Record<string, string>) => run(v).scenario.nodes.find((n) => n.id === 'orders');
    expect(ordersNode(values('on'))).toEqual(ordersNode(values('off')));
  });

  it('refuses the scraper with mTLS', () => {
    const s = scraper(values('on', '2', 'on'));
    expect(s).toMatchObject({ status: 'failed', reason: '403: no client certificate' });
    expect(s.hops).not.toContain('payments-1');
  });

  it('still fails orders with a mesh but no retries', () => {
    expect(flaky(values('on', '0'))).toBeGreaterThanOrEqual(1);
  });

  it('reports the extra time each call spends in the proxies', () => {
    expect(serviceMeshSteps(values('on')).at(-1)!.variables).toMatchObject({ 'extra ms per call': 6 });
    expect(serviceMeshSteps(values('off')).at(-1)!.variables).toMatchObject({ 'extra ms per call': 0 });
  });

  it('refuses 4 retries', () => {
    expect(serviceMeshSteps(values('on', '4'))[0]!.why).toBe('Mesh retries must be a whole number from 0 to 3.');
  });
});
