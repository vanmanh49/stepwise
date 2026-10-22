import { describe, expect, it } from 'vitest';
import type { CallPolicy, Fault, RequestSpec, Scenario, SimResult } from './model';
import { client, link, service, sidecarNode } from './scenarios/shared';
import { simulate } from './sim';

const order: RequestSpec = { label: 'POST /orders', path: '/orders', to: 'orders', at: 0 };

/** client → orders → payments, directly or through orders-proxy and payments-proxy. */
function shop(mesh: boolean, options: { policy?: CallPolicy; mtls?: boolean; faults?: Fault[]; requests?: RequestSpec[] } = {}): Scenario {
  const { policy, mtls, faults = [], requests = [order] } = options;
  const plain = [link('client', 'orders'), link('orders', 'payments'), link('client', 'payments')];
  return {
    nodes: [
      client(),
      service('orders', 1, ['payments']),
      service('payments', 2),
      ...(mesh ? [sidecarNode('orders', 1, { ...(policy && { policy }) }), sidecarNode('payments', 2, { ...(mtls && { mtls }) })] : []),
    ],
    links: mesh
      ? [link('client', 'orders-proxy'), link('orders-proxy', 'orders', 1), link('orders-proxy', 'payments-proxy'), link('payments-proxy', 'payments', 1), link('client', 'payments-proxy')]
      : plain,
    requests,
    faults,
  };
}

/** From orders-1 sending its call for #1 to the answer arriving back at orders-1. */
function callMs(result: SimResult): number {
  const sent = result.trace.find((e) => e.kind === 'send' && e.message.from === 'orders-1' && e.message.kind === 'request')!;
  const back = result.trace.find((e) => e.kind === 'arrive' && e.message.to === 'orders-1' && e.message.kind === 'reply')!;
  return back.t - sent.t;
}

describe('sidecars', () => {
  it('routes a call out through the caller sidecar and in through the target sidecar', () => {
    const result = simulate(shop(true));
    expect(result.requests[0]).toMatchObject({ status: 'ok', hops: ['client', 'orders-proxy', 'orders-1', 'orders-proxy', 'payments-proxy', 'payments-1'] });
  });

  it('adds 6 ms per call: four loopback hops and 1 ms in each proxy on the way in', () => {
    const [mesh, plain] = [simulate(shop(true)), simulate(shop(false))];
    expect(callMs(mesh) - callMs(plain)).toBe(6);
    // The client's own hop to orders also goes through orders-proxy: 1 ms link each way and 1 ms in the proxy.
    expect(mesh.requests[0]!.ms - plain.requests[0]!.ms).toBe(9);
  });

  it('retries in the sidecar while the app code stays the same', () => {
    const policy: CallPolicy = { retry: { attempts: 2, backoff: 'fixed', baseMs: 10, jitter: false } };
    const outage: Fault = { kind: 'outage', node: 'payments', from: 0, until: 30, mode: 'refuse' };
    const meshed = shop(true, { policy, faults: [outage] });
    const result = simulate(meshed);
    expect(result.requests[0]!.status).toBe('ok');
    expect(result.trace.find((e) => e.kind === 'retry')).toMatchObject({ caller: 'orders-proxy', attempt: 1 });
    expect(meshed.nodes.find((n) => n.id === 'orders')).toEqual(shop(false).nodes.find((n) => n.id === 'orders'));
    expect(simulate(shop(false, { faults: [outage] })).requests[0]!.status).toBe('failed');
  });

  it('refuses a caller without a certificate when mtls is on', () => {
    const scraper: RequestSpec = { label: 'GET /charges', path: '/charges', to: 'payments', at: 0, caller: 'scraper' };
    const result = simulate(shop(true, { mtls: true, requests: [scraper] }));
    expect(result.requests[0]).toMatchObject({ status: 'failed', reason: '403: no client certificate' });
    expect(result.trace.find((e) => e.kind === 'deny')).toMatchObject({ node: 'payments-proxy', request: '#1' });
    expect(simulate(shop(true, { mtls: true })).requests[0]!.status).toBe('ok');
    expect(simulate(shop(false, { requests: [scraper] })).requests[0]!.status).toBe('ok');
  });
});
