import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Action, Ingress, IngressPath, Scenario } from '../model';
import { deployment, scenarioSteps, service } from './shared';

export const ingressCode = `// Ingress controller (ingress-nginx), for each HTTP request
const rules = rulesFor(request.host)          // rules naming this host, else host-less ones
const match = rules
  .filter((r) => r.pathType === 'Exact' ? r.path === path : prefixOf(r.path, path)) // whole path elements
  .sort(longestFirst)[0]                      // Exact wins a tie
const backend = match?.service ?? defaultBackend
if (!backend) return 404
if (endpoints(backend).length === 0) return 503
proxy(request, pick(endpoints(backend)))     // straight to a pod`;

export const PATH_TYPES = ['Prefix', 'Exact'];
export const DEFAULT_BACKENDS = ['none', 'web'];
export const CONTROLLER = ['on', 'off'];
const REQUESTS: [string, string][] = [
  ['shop.example.com', '/'],
  ['shop.example.com', '/api/cart'],
  ['shop.example.com', '/apiary'],
  ['shop.example.com', '/api'],
  ['admin.example.com', '/'],
];

export function ingressScenario(values: Record<string, string>): Read<Scenario> {
  const apiPathType = readChoice(values, 'apiPathType', '/api pathType', PATH_TYPES);
  if (!apiPathType.ok) return apiPathType;
  const defaultBackend = readChoice(values, 'defaultBackend', 'Default backend', DEFAULT_BACKENDS);
  if (!defaultBackend.ok) return defaultBackend;
  const apiReplicas = readInt(values, 'apiReplicas', 'api replicas', { min: 0, max: 2 });
  if (!apiReplicas.ok) return apiReplicas;
  const controller = readChoice(values, 'controller', 'Ingress controller', CONTROLLER);
  if (!controller.ok) return controller;
  const ingress: Ingress = {
    kind: 'Ingress',
    name: 'shop',
    rules: [
      {
        host: 'shop.example.com',
        paths: [
          { path: '/', pathType: 'Prefix', service: 'web' },
          { path: '/api', pathType: apiPathType.value as IngressPath['pathType'], service: 'api' },
        ],
      },
    ],
    ...(defaultBackend.value !== 'none' && { defaultBackend: defaultBackend.value }),
  };
  const actions: Action[] = [
    { at: 0, kind: 'apply', object: deployment('web', 1) },
    { at: 0, kind: 'apply', object: deployment('api', apiReplicas.value) },
    { at: 0, kind: 'apply', object: service('web') },
    { at: 0, kind: 'apply', object: service('api') },
    { at: 0, kind: 'apply', object: ingress },
    ...REQUESTS.map(([host, path], i): Action => ({ at: 15 + 3 * i, kind: 'request', id: `#${i + 1}`, service: '', host, path })),
  ];
  return { ok: true, value: { nodes: [{ name: 'node-1', cpu: 4 }, { name: 'node-2', cpu: 4 }], actions, faults: [], ingressController: controller.value === 'on' } };
}

export function ingressSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(ingressScenario(values), "Can't set up this Ingress", {
    code: ingressCode,
    lines: { ingress: 'proxy(request', 'request-fail': 'return 404' },
    explain: (event) => {
      if (event.kind === 'ingress' && event.text.includes('default backend')) return { line: 'defaultBackend', why: 'No rule matches this host, so the controller uses the Ingress\'s default backend.' };
      if (event.kind === 'ingress') return { why: 'The controller picks the rules for this host and the longest path that matches. Prefix matches whole path elements, so /api covers /api/cart but not /apiary. It then sends the request straight to one of the Service\'s ready pods.' };
      if (event.reason === '404 Not Found') return { line: 'return 404', why: 'No rule matches the host and path, and there is no default backend, so the controller answers 404 itself. The request never reaches a pod.' };
      if (event.reason === '503 Service Unavailable') return { line: 'return 503', why: 'A rule matched, but its Service has no ready pods. The controller answers 503 Service Unavailable.' };
      if (event.reason?.includes('no ingress controller')) return { line: 'const rules', why: 'An Ingress is only a set of rules stored in the API server. Without an ingress controller running in the cluster, nothing reads them and nothing listens for traffic.' };
      return undefined;
    },
  });
}
