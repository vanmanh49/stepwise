import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Fault, NodeSpec, Scenario, SimResult, TraceEvent } from '../model';
import type { StepOptions } from '../steps';
import { client, gateway, link, scenarioSteps, service } from './shared';

export const stranglerFigCode = `// facade: the one address clients use, before and after
const routes = {
  '/catalog': catalog,                 // moved: new service
  '/orders': orders,                   // moved: new service
  '/': monolith,                       // everything not moved yet
}

function handle(req) {
  const target = longestMatch(routes, req.path)
  return forward(req, target)
}

// a moved path misbehaves? point it back, nothing else changes
routes['/orders'] = monolith`;

export const APPROACHES = ['strangler', 'big-bang'] as const;
export const BUGS = ['none', 'new-orders'] as const;
/** The paths, in the order they move to new services. */
const PATHS = ['catalog', 'orders', 'payments'];
const GAP_MS = 30;
const ROUTE_BACK_AT = 200;

interface Settings {
  bigBang: boolean;
  migrated: number;
  bug: boolean;
  requests: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const approach = readChoice(values, 'approach', 'Approach', APPROACHES);
  if (!approach.ok) return approach;
  const migrated = readInt(values, 'migrated', 'Paths moved', { min: 0, max: 3 });
  if (!migrated.ok) return migrated;
  const bug = readChoice(values, 'bug', 'Bug', BUGS);
  if (!bug.ok) return bug;
  const requests = readInt(values, 'requests', 'Requests', { min: 3, max: 12 });
  if (!requests.ok) return requests;
  return { ok: true, value: { bigBang: approach.value === 'big-bang', migrated: migrated.value, bug: bug.value === 'new-orders', requests: requests.value } };
}

export function stranglerFigScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { bigBang, migrated, bug, requests } = settings.value;
  const moved = bigBang ? PATHS : PATHS.slice(0, migrated);
  const routes = [...moved.map((id) => ({ prefix: `/${id}`, to: id })), ...(bigBang ? [] : [{ prefix: '/', to: 'monolith' }])];
  const facade: NodeSpec = { ...gateway(routes), id: 'facade', label: 'facade' };
  const faults: Fault[] = [];
  if (bug && moved.includes('orders')) {
    faults.push({ kind: 'errors', node: 'orders', rate: 1, reason: '500: bug in new orders' });
    if (!bigBang) faults.push({ kind: 'reroute', gateway: 'facade', at: ROUTE_BACK_AT, prefix: '/orders', to: 'monolith' });
  }
  return {
    ok: true,
    value: {
      nodes: [client(), facade, ...(bigBang ? [] : [service('monolith', 2)]), ...moved.map((id) => service(id, 2))],
      links: [link('client', 'facade'), ...(bigBang ? [] : [link('facade', 'monolith')]), ...moved.map((id) => link('facade', id))],
      requests: Array.from({ length: requests }, (_, i) => ({ label: `GET /${PATHS[i % 3]}`, path: `/${PATHS[i % 3]}`, to: 'facade', at: i * GAP_MS })),
      faults,
    },
  };
}

/** The share of routed requests the monolith got so far. */
function monolithShare(result: SimResult, upTo: TraceEvent): string {
  const routed = result.trace.slice(0, result.trace.indexOf(upTo) + 1).filter((e) => e.kind === 'route');
  if (routed.length === 0) return '–';
  const monolith = routed.filter((e) => e.kind === 'route' && e.to === 'monolith').length;
  return `${Math.round((monolith / routed.length) * 100)}%`;
}

export function stranglerFigSteps(values: Record<string, string>): Step[] {
  const options = (result: SimResult): StepOptions => ({
    code: stranglerFigCode,
    lines: { route: 'const target = longestMatch(routes, req.path)', reject: 'const target = longestMatch(routes, req.path)', fault: "routes['/orders'] = monolith", done: 'return forward(req, target)' },
    explain: (event) => (event.kind === 'handle' ? { line: 'return forward(req, target)' } : undefined),
    variables: (event) => ({ 'monolith share': monolithShare(result, event) }),
  });
  return scenarioSteps(stranglerFigScenario(values), 'Check the settings', options);
}
