import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario } from '../model';
import type { StepOptions } from '../steps';
import { client, link, scenarioSteps, service } from './shared';

export const circuitBreakerCode = `async function call(req) {
  if (state === 'open') {
    if (now() - openedAt < OPEN_MS) throw new CircuitOpen()  // fail fast
    state = 'half-open'                     // let one trial call through
  }
  try {
    const answer = await callWithTimeout(payments, req, 100)
    onSuccess()
    return answer
  } catch (err) {
    onFailure()
    throw err
  }
}

function onSuccess() { failures = 0; state = 'closed' }
function onFailure() {
  failures++
  if (state === 'half-open' || failures >= THRESHOLD) {
    state = 'open'; openedAt = now()
  }
}`;

const TIMEOUT_MS = 100;
const GAP_MS = 40;
/** payments hangs from this time until it recovers. */
const OUTAGE_FROM = 40;

interface Settings {
  breaker: boolean;
  threshold: number;
  openMs: number;
  recovers: number;
  requests: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const breaker = readChoice(values, 'breaker', 'Breaker', ['off', 'on']);
  if (!breaker.ok) return breaker;
  const threshold = readInt(values, 'threshold', 'Threshold', { min: 1, max: 5 });
  if (!threshold.ok) return threshold;
  const openMs = readInt(values, 'openMs', 'Open time', { min: 50, max: 500 });
  if (!openMs.ok) return openMs;
  const recovers = readInt(values, 'recovers', 'Payments recovers at', { min: 100, max: 2000 });
  if (!recovers.ok) return recovers;
  const requests = readInt(values, 'requests', 'Requests', { min: 4, max: 16 });
  if (!requests.ok) return requests;
  return { ok: true, value: { breaker: breaker.value === 'on', threshold: threshold.value, openMs: openMs.value, recovers: recovers.value, requests: requests.value } };
}

export function circuitBreakerScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { breaker, threshold, openMs, recovers, requests } = settings.value;
  return {
    ok: true,
    value: {
      nodes: [
        client(),
        service('api', 1, [{ to: 'payments', policy: { timeoutMs: TIMEOUT_MS, ...(breaker && { breaker: { threshold, openMs } }) } }]),
        service('payments', 2),
      ],
      links: [link('client', 'api'), link('api', 'payments')],
      requests: Array.from({ length: requests }, (_, i) => ({ label: 'POST /pay', path: '/pay', to: 'api', at: i * GAP_MS })),
      faults: [{ kind: 'outage', node: 'payments', from: OUTAGE_FROM, until: recovers, mode: 'hang' }],
    },
  };
}

export function circuitBreakerSteps(values: Record<string, string>): Step[] {
  const options: StepOptions = {
    code: circuitBreakerCode,
    lines: { handle: 'async function call(req)', timeout: 'callWithTimeout(', shed: 'throw new CircuitOpen()', done: 'return answer' },
    explain: (event) => {
      if (event.kind === 'breaker') {
        if (event.state === 'open') return { line: "state = 'open'" };
        if (event.state === 'half-open') return { line: "state = 'half-open'" };
        return { line: event.failures === 0 ? 'function onSuccess()' : 'failures++' };
      }
      if (event.kind === 'send' && event.message.from === 'api-1' && event.message.kind === 'request') return { line: 'callWithTimeout(' };
      if (event.kind === 'send' && event.message.from === 'api-1' && event.message.kind === 'reply') return { line: event.message.ok ? 'return answer' : 'throw err' };
      if (event.kind === 'done' && !event.ok) return { line: event.reason === 'circuit open' ? 'throw new CircuitOpen()' : 'throw err' };
      return undefined;
    },
  };
  return scenarioSteps(circuitBreakerScenario(values), 'Check the settings', options);
}
