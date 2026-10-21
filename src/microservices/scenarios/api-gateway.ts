import { readChoice, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario } from '../model';
import type { StepOptions } from '../steps';
import { client, gateway, link, scenarioSteps, service } from './shared';

export const apiGatewayCode = `function gateway(req) {
  if (authRequired && !req.token) {
    return 401                            // stopped at the door
  }
  const target = routes.match(req.path)   // longest matching prefix
  if (!target) {
    return 404                            // no service owns this path
  }
  return forward(target, req)             // services only see good requests
}`;

export const API_GATEWAY_PATHS = ['/orders/42', '/users/7', '/payments/1'];

export function apiGatewayScenario(values: Record<string, string>): Read<Scenario> {
  const path = readChoice(values, 'path', 'Path', API_GATEWAY_PATHS);
  if (!path.ok) return path;
  const token = readChoice(values, 'token', 'Token', ['yes', 'no']);
  if (!token.ok) return token;
  const auth = readChoice(values, 'auth', 'Auth', ['required', 'off']);
  if (!auth.ok) return auth;
  const routes = [
    { prefix: '/orders', to: 'orders' },
    { prefix: '/users', to: 'users' },
  ];
  return {
    ok: true,
    value: {
      nodes: [client(), gateway(routes, auth.value === 'required'), service('orders', 2), service('users', 2)],
      links: [link('client', 'gateway'), link('gateway', 'orders'), link('gateway', 'users')],
      requests: [{ label: `GET ${path.value}`, path: path.value, to: 'gateway', at: 0, token: token.value === 'yes' }],
      faults: [],
    },
  };
}

export function apiGatewaySteps(values: Record<string, string>): Step[] {
  const authRequired = values.auth?.trim() === 'required';
  const options: StepOptions = {
    code: apiGatewayCode,
    lines: { arrive: 'function gateway(req)', route: 'routes.match(req.path)', handle: 'return forward(target, req)', done: 'function gateway(req)' },
    explain: (event) => {
      if (event.kind === 'reject') return { line: event.status === 401 ? 'return 401' : 'return 404' };
      if (event.kind === 'route' && authRequired) return { why: `The request carries a token, so the gateway lets it in. Its path starts with /${event.to}, which belongs to ${event.to}.` };
      if (event.kind === 'send') {
        const m = event.message;
        if (m.from === 'gateway' && m.kind === 'request') return { line: 'return forward(target, req)', why: `The gateway passes the request on. ${m.to} never has to check tokens or paths itself.` };
        if (m.from === 'gateway' && m.kind === 'reply' && !m.ok) return { line: m.reason?.startsWith('401') ? 'return 401' : 'return 404' };
        if (m.kind === 'reply') return { line: 'return forward(target, req)' };
      }
      return undefined;
    },
  };
  return scenarioSteps(apiGatewayScenario(values), 'Check the settings', options);
}
