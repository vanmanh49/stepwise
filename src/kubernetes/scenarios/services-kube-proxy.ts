import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Action, Scenario } from '../model';
import { appSelector, deployment, nodes, scenarioSteps, service } from './shared';

export const servicesKubeProxyCode = `// Endpoints controller, on every pod or Service change
endpoints[svc] = pods.filter((p) =>
  p.ready && matches(p.labels, svc.selector))

// kube-proxy on each node, for a new connection to the Service
const list = endpoints[svc]
if (list.length === 0) refuse('no endpoints')
else forward(conn, list[randomIndex(list.length)])`;

export const NOT_READY = ['off', 'on'];
export const SELECTORS = ['correct', 'typo'];
const FIRST_REQUEST = 12;
const REQUESTS = 10;

export function servicesKubeProxyScenario(values: Record<string, string>): Read<Scenario> {
  const replicas = readInt(values, 'replicas', 'Replicas', { min: 1, max: 4 });
  if (!replicas.ok) return replicas;
  const notReady = readChoice(values, 'notReady', 'A pod goes not-ready', NOT_READY);
  if (!notReady.ok) return notReady;
  const selector = readChoice(values, 'selector', 'Service selector', SELECTORS);
  if (!selector.ok) return selector;
  const requests: Action[] = Array.from({ length: REQUESTS }, (_, i) => ({ at: FIRST_REQUEST + i, kind: 'request', id: `#${i + 1}`, service: 'web' }));
  return {
    ok: true,
    value: {
      nodes: nodes(2),
      actions: [
        { at: 0, kind: 'apply', object: deployment('web', replicas.value) },
        { at: 0, kind: 'apply', object: service('web', appSelector(selector.value === 'typo' ? 'wbe' : 'web')) },
        ...requests,
      ],
      faults: notReady.value === 'on' ? [{ kind: 'not-ready', prefix: 'web-', at: FIRST_REQUEST + 4 }] : [],
    },
  };
}

export function servicesKubeProxySteps(values: Record<string, string>): Step[] {
  return scenarioSteps(servicesKubeProxyScenario(values), "Can't run this Service", {
    code: servicesKubeProxyCode,
    lines: { endpoints: 'endpoints[svc] =', 'not-ready': 'p.ready && matches', route: 'forward(conn', 'request-fail': "refuse('no endpoints')" },
    explain: (event, state) => {
      if (event.kind === 'action' && event.text.includes('Service')) {
        return { why: 'A Service gives a stable address (its ClusterIP) to a changing set of pods. It finds them with its selector, not by name.' };
      }
      if (event.kind === 'endpoints') {
        const count = state.endpoints.find((e) => e.name === 'web')?.pods.length ?? 0;
        return { why: count === 0 ? 'No ready pod matches the Service\'s selector, so its Endpoints list is empty. Connections to it will be refused.' : `The Endpoints controller lists the ${count} ready pod${count === 1 ? '' : 's'} that match the selector. kube-proxy on every node reads this list.` };
      }
      if (event.kind === 'route') return { why: 'kube-proxy picks one endpoint at random for each new connection, so the requests spread over the ready pods.' };
      if (event.kind === 'not-ready') return { why: 'The pod is still Running, but it stops passing its readiness check. The Endpoints controller removes it on its next pass, 1 s later; until then kube-proxy can still pick it.' };
      return undefined;
    },
  });
}
