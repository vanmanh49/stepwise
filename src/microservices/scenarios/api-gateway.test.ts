import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { apiGatewayScenario, apiGatewaySteps } from './api-gateway';

const only = (values: Record<string, string>) => {
  const read = apiGatewayScenario(values);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).requests[0]!;
};

const reachedAService = (hops: string[]) => hops.some((h) => /-\d+$/.test(h));

describe('API Gateway', () => {
  it('routes by path to the service that owns it', () => {
    expect(only({ path: '/orders/42', token: 'yes', auth: 'required' })).toMatchObject({ status: 'ok', hops: ['client', 'gateway', 'orders-1'] });
    expect(only({ path: '/users/7', token: 'yes', auth: 'required' }).hops).toEqual(['client', 'gateway', 'users-1']);
  });

  it('rejects a request without a token at the gateway', () => {
    const request = only({ path: '/orders/42', token: 'no', auth: 'required' });
    expect(request).toMatchObject({ status: 'failed', reason: '401: no token' });
    expect(reachedAService(request.hops)).toBe(false);
  });

  it('answers 404 for a path no service owns', () => {
    const request = only({ path: '/payments/1', token: 'yes', auth: 'required' });
    expect(request).toMatchObject({ status: 'failed', reason: '404: no route for /payments/1' });
    expect(reachedAService(request.hops)).toBe(false);
  });

  it('lets a request without a token through when auth is off', () => {
    expect(only({ path: '/orders/42', token: 'no', auth: 'off' }).status).toBe('ok');
  });

  it('refuses a path that is not one of the choices', () => {
    expect(apiGatewaySteps({ path: '/admin', token: 'yes', auth: 'required' })).toHaveLength(1);
  });
});
