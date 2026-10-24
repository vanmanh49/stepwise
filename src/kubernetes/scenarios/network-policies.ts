import { readChoice, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Action, NetworkPolicy, Scenario } from '../model';
import { appSelector, deployment, scenarioSteps, service } from './shared';

export const networkPoliciesCode = `// For each connection from one pod to another (enforced by the CNI plugin)
const out = policies.filter((p) => p.types.includes('Egress') && selects(p, from))
if (out.length > 0) {                          // the source is isolated for egress
  if (!out.some(allowsDns)) drop()             // even the DNS lookup is blocked
  if (!out.some((p) => allowsTo(p, to))) drop()
}
const into = policies.filter((p) => p.types.includes('Ingress') && selects(p, to))
if (into.length > 0 && !into.some((p) => allowsFrom(p, from))) drop()
deliver()                                      // no policy selects it: allowed
// drop(): the packets vanish, so the client only sees a timeout`;

export const POLICIES = ['none', 'default deny', 'deny + allow frontend→api', 'deny + allow frontend→api, api→db'];
export const ON_OFF = ['off', 'on'];

const defaultDeny: NetworkPolicy = { kind: 'NetworkPolicy', name: 'default-deny', podSelector: [], policyTypes: ['Ingress'] };
const apiFromFrontend: NetworkPolicy = { kind: 'NetworkPolicy', name: 'api-from-frontend', podSelector: appSelector('api'), policyTypes: ['Ingress'], ingress: [{ from: [appSelector('frontend')] }] };
const dbFromApi: NetworkPolicy = { kind: 'NetworkPolicy', name: 'db-from-api', podSelector: appSelector('db'), policyTypes: ['Ingress'], ingress: [{ from: [appSelector('api')] }] };

export function networkPoliciesScenario(values: Record<string, string>): Read<Scenario> {
  const policies = readChoice(values, 'policies', 'Ingress policies', POLICIES);
  if (!policies.ok) return policies;
  const egress = readChoice(values, 'egress', 'Lock down frontend egress', ON_OFF);
  if (!egress.ok) return egress;
  const dns = readChoice(values, 'dns', 'Allow DNS', ON_OFF);
  if (!dns.ok) return dns;
  const chosen: NetworkPolicy[] = [
    ...(policies.value === 'none' ? [] : [defaultDeny]),
    ...(policies.value.includes('frontend→api') ? [apiFromFrontend] : []),
    ...(policies.value.includes('api→db') ? [dbFromApi] : []),
    // frontend may only talk to api; forgetting DNS is the classic mistake.
    ...(egress.value === 'on' ? [{ kind: 'NetworkPolicy' as const, name: 'frontend-egress', podSelector: appSelector('frontend'), policyTypes: ['Egress' as const], egress: [{ to: [appSelector('api')], ...(dns.value === 'on' && { dns: true }) }] }] : []),
  ];
  const pairs: [string, string][] = [
    ['frontend', 'api'],
    ['debug', 'api'],
    ['api', 'db'],
  ];
  const requests: Action[] = [15, 25].flatMap((start, round) => pairs.map(([from, to], i): Action => ({ at: start + 2 * i, kind: 'request', id: `#${round * 3 + i + 1}`, service: to, from })));
  const actions: Action[] = [
    ...['frontend', 'debug', 'api', 'db'].map((name): Action => ({ at: 0, kind: 'apply', object: deployment(name, 1) })),
    { at: 0, kind: 'apply', object: service('api') },
    { at: 0, kind: 'apply', object: service('db') },
    ...chosen.map((object): Action => ({ at: 0, kind: 'apply', object })),
    ...requests,
  ];
  return { ok: true, value: { nodes: [{ name: 'node-1', cpu: 4 }, { name: 'node-2', cpu: 4 }], actions, faults: [] } };
}

export function networkPoliciesSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(networkPoliciesScenario(values), "Can't apply these policies", {
    code: networkPoliciesCode,
    lines: { route: 'deliver()', 'policy-drop': 'drop()' },
    explain: (event) => {
      if (event.reason?.startsWith('DNS lookup')) {
        return { line: 'if (!out.some(allowsDns)) drop()', why: 'frontend is isolated for egress, and its only rule allows traffic to api. Looking up the name "api" is traffic too (to the cluster DNS, port 53), and nothing allows it, so the request fails before it starts.' };
      }
      if (event.kind === 'policy-drop' && event.text.includes('may not send')) return { line: "if (!out.some((p) => allowsTo(p, to))) drop()", why: 'The source pod is isolated for egress and none of its rules allows this destination.' };
      if (event.kind === 'policy-drop') return { line: 'if (into.length > 0', why: 'A policy selects the destination pod, so only traffic its rules allow gets in. This source isn\'t allowed, so the packets are dropped. The client gets no error, only a timeout.' };
      if (event.kind === 'route' && event.rules) return { why: 'Policies select the destination pod, and one of their rules allows this source, so the connection goes through. Rules from several policies add up.' };
      if (event.kind === 'route') return { line: 'deliver()', why: 'No NetworkPolicy selects either pod, so they are not isolated: every pod can talk to every other pod.' };
      return undefined;
    },
  });
}
