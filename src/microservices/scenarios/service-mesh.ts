import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { CallPolicy, Scenario } from '../model';
import type { StepOptions } from '../steps';
import { client, link, scenarioSteps, service, SIDECAR_MS, sidecarNode } from './shared';

export const serviceMeshCode = `// orders: the app code never changes
async function handle(req) {
  const res = await http.post('payments/charge', req)   // goes to its sidecar
  return res
}

# mesh config, pushed to every sidecar
route payments:
  retries: 2                  # try again on 5xx
  perTryTimeout: 100ms
  mtls: STRICT                # only callers with a mesh certificate`;

const GAP_MS = 30;
const SCRAPER_AT = 15;
const FLAKY_RATE = 0.4;
/** Loopback hops added per call (to and from each sidecar), plus each sidecar's own time on the way in. */
const EXTRA_MS = 4 * 1 + 2 * SIDECAR_MS;

interface Settings {
  mesh: boolean;
  retries: number;
  mtls: boolean;
  requests: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const mesh = readChoice(values, 'mesh', 'Mesh', ['off', 'on']);
  if (!mesh.ok) return mesh;
  const retries = readInt(values, 'retries', 'Mesh retries', { min: 0, max: 3 });
  if (!retries.ok) return retries;
  const mtls = readChoice(values, 'mtls', 'mTLS', ['off', 'on']);
  if (!mtls.ok) return mtls;
  const requests = readInt(values, 'requests', 'Orders', { min: 4, max: 12 });
  if (!requests.ok) return requests;
  return { ok: true, value: { mesh: mesh.value === 'on', retries: retries.value, mtls: mtls.value === 'on', requests: requests.value } };
}

export function serviceMeshScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { mesh, retries, mtls, requests } = settings.value;
  const policy: CallPolicy = { timeoutMs: 100, ...(retries > 0 && { retry: { attempts: retries, backoff: 'fixed', baseMs: 10, jitter: false } }) };
  return {
    ok: true,
    value: {
      nodes: [
        client(),
        service('orders', 1, ['payments']),
        service('payments', 2),
        ...(mesh ? [sidecarNode('orders', 1, { policy }), sidecarNode('payments', 2, { mtls })] : []),
      ],
      links: mesh
        ? [link('client', 'orders-proxy'), link('orders-proxy', 'orders', 1), link('orders-proxy', 'payments-proxy'), link('payments-proxy', 'payments', 1), link('client', 'payments-proxy')]
        : [link('client', 'orders'), link('orders', 'payments'), link('client', 'payments')],
      requests: [
        ...Array.from({ length: requests }, (_, i) => ({ label: 'POST /orders', path: '/orders', to: 'orders', at: i * GAP_MS })),
        { label: 'GET /charges (scraper)', path: '/charges', to: 'payments', at: SCRAPER_AT, caller: 'scraper' },
      ],
      faults: [{ kind: 'errors', node: 'payments', rate: FLAKY_RATE, reason: '500: flaky' }],
      seed: 7,
    },
  };
}

export function serviceMeshSteps(values: Record<string, string>): Step[] {
  const mesh = values.mesh === 'on';
  const options: StepOptions = {
    code: serviceMeshCode,
    lines: { handle: 'async function handle(req)', retry: 'retries: ', deny: 'mtls: STRICT', timeout: 'perTryTimeout: 100ms', done: 'return res' },
    explain: (event) => (event.kind === 'send' && event.message.dest ? { line: "const res = await http.post('payments/charge', req)" } : undefined),
    variables: () => ({ 'extra ms per call': mesh ? EXTRA_MS : 0 }),
  };
  return scenarioSteps(serviceMeshScenario(values), 'Check the settings', options);
}
