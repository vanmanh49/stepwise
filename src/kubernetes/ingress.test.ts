import { describe, expect, it } from 'vitest';
import { deploymentOf, nodesOf, serviceOf } from './fixtures.testutil';
import { matchIngress } from './ingress';
import type { Action, Ingress, IngressPath } from './model';
import { simulate } from './sim';

const shop = (api: IngressPath['pathType'] = 'Prefix', extra: Partial<Ingress> = {}): Ingress => ({
  kind: 'Ingress',
  name: 'shop',
  rules: [
    {
      host: 'shop.example.com',
      paths: [
        { path: '/', pathType: 'Prefix', service: 'web' },
        { path: '/api', pathType: api, service: 'api' },
      ],
    },
  ],
  ...extra,
});
const target = (ing: Ingress[], host: string, path: string) => matchIngress(ing, host, path)?.service;

describe('matchIngress', () => {
  it('sends a path to the longest Prefix that matches whole path elements', () => {
    expect(target([shop()], 'shop.example.com', '/api/cart')).toBe('api');
    expect(target([shop()], 'shop.example.com', '/api')).toBe('api');
    expect(target([shop()], 'shop.example.com', '/apiary')).toBe('web');
    expect(target([shop()], 'shop.example.com', '/')).toBe('web');
  });

  it('matches Exact paths only exactly', () => {
    expect(target([shop('Exact')], 'shop.example.com', '/api')).toBe('api');
    expect(target([shop('Exact')], 'shop.example.com', '/api/cart')).toBe('web');
  });

  it('prefers Exact over Prefix at the same length', () => {
    const both: Ingress = { kind: 'Ingress', name: 'x', rules: [{ paths: [{ path: '/api', pathType: 'Prefix', service: 'p' }, { path: '/api', pathType: 'Exact', service: 'e' }] }] };
    expect(target([both], 'any', '/api')).toBe('e');
    expect(target([both], 'any', '/api/x')).toBe('p');
  });

  it('lets a rule without a host match any host, and leaves other hosts to the default backend or nothing', () => {
    const open: Ingress = { kind: 'Ingress', name: 'open', rules: [{ paths: [{ path: '/', pathType: 'Prefix', service: 'web' }] }] };
    expect(target([open], 'whatever.example.com', '/x')).toBe('web');
    expect(matchIngress([shop()], 'admin.example.com', '/')).toBeUndefined();
    expect(matchIngress([shop('Prefix', { defaultBackend: 'web' })], 'admin.example.com', '/')).toEqual({ service: 'web', rule: 'default' });
  });

  it('gets 404 with no default backend for a path nothing matches', () => {
    const apiOnly: Ingress = { kind: 'Ingress', name: 'a', rules: [{ host: 'h', paths: [{ path: '/api', pathType: 'Prefix', service: 'api' }] }] };
    expect(matchIngress([apiOnly], 'h', '/apiary')).toBeUndefined();
  });
});

describe('Requests through the Ingress controller', () => {
  const run = (apiReplicas: number, controller = true, paths: string[] = ['/api/cart']) => {
    const requests: Action[] = paths.map((path, i) => ({ at: 20 + i, kind: 'request', id: `#${i + 1}`, service: '', host: 'shop.example.com', path }));
    return simulate({
      nodes: nodesOf(2),
      ingressController: controller,
      actions: [
        { at: 0, kind: 'apply', object: deploymentOf('web', 1) },
        { at: 0, kind: 'apply', object: deploymentOf('api', apiReplicas) },
        { at: 0, kind: 'apply', object: serviceOf('web') },
        { at: 0, kind: 'apply', object: serviceOf('api') },
        { at: 0, kind: 'apply', object: shop() },
        ...requests,
      ],
      faults: [],
    });
  };

  it('routes by path to a ready pod of the matched Service, and shows the rule that matched', () => {
    const { frames, final } = run(1);
    expect(final!.requests[0]).toMatchObject({ status: 'ok', service: 'api', host: 'shop.example.com', path: '/api/cart' });
    expect(final!.requests[0]!.pod).toMatch(/^api-/);
    const step = frames.find((f) => f.event.kind === 'ingress')!;
    expect(step.event.rules!.rows.filter((r) => r.mark === 'match').map((r) => r.cells)).toEqual([['shop.example.com', '/api', 'Prefix', 'api']]);
  });

  it('answers 503 when the Service has no ready pods', () => {
    expect(run(0).final!.requests[0]).toMatchObject({ status: 'failed', reason: '503 Service Unavailable' });
  });

  it('answers 404 for a host nothing matches', () => {
    const { final } = simulate({ nodes: nodesOf(1), ingressController: true, actions: [{ at: 0, kind: 'apply', object: shop() }, { at: 5, kind: 'request', id: '#1', service: '', host: 'admin.example.com', path: '/' }], faults: [] });
    expect(final!.requests[0]).toMatchObject({ status: 'failed', reason: '404 Not Found' });
  });

  it('refuses every request without an Ingress controller', () => {
    expect(run(1, false).final!.requests[0]).toMatchObject({ status: 'failed', reason: 'connection refused: no ingress controller is running' });
  });
});
