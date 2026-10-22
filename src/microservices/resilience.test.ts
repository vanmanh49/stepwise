import { describe, expect, it } from 'vitest';
import { rng } from '../data-structures/random.testutil';
import { allLessons } from '../lessons/all.testutil';
import type { CallPolicy, Fault, NodeSpec, RequestSpec, Scenario, SimResult, TraceEvent } from './model';
import { retryDelay } from './resilience';
import { simulate } from './sim';
import { apiGatewayScenario } from './scenarios/api-gateway';
import { databasePerServiceScenario } from './scenarios/database-per-service';
import { loadBalancingScenario } from './scenarios/load-balancing';
import { monolithVsMicroservicesScenario } from './scenarios/monolith-vs-microservices';
import { serviceBoundariesScenario } from './scenarios/service-boundaries';
import { serviceDiscoveryScenario } from './scenarios/service-discovery';
import { synchronousCallsScenario } from './scenarios/synchronous-calls';
import { client, link, service } from './scenarios/shared';

const at = (time: number): RequestSpec => ({ label: 'GET /', path: '/', to: 'api', at: time });

/** client → api (10 ms unless given), with the client's policy and any faults. */
function direct(policy: CallPolicy | undefined, requests: RequestSpec[], faults: Fault[] = [], processMs = 10): Scenario {
  return {
    nodes: [client(), service('api', 1, [], { processMs })],
    links: [link('client', 'api')],
    requests,
    faults,
    ...(policy && { clientPolicy: policy }),
  };
}

const refuse = (until: number): Fault => ({ kind: 'outage', node: 'api', from: 0, until, mode: 'refuse' });

describe('retryDelay', () => {
  const r = rng(1);
  const base = { attempts: 4, baseMs: 50, jitter: false };

  it('computes retry delays', () => {
    expect([1, 2, 3, 4].map((n) => retryDelay({ ...base, backoff: 'none' }, n, r))).toEqual([0, 0, 0, 0]);
    expect([1, 2, 3, 4].map((n) => retryDelay({ ...base, backoff: 'fixed' }, n, r))).toEqual([50, 50, 50, 50]);
    expect([1, 2, 3, 4].map((n) => retryDelay({ ...base, backoff: 'exponential' }, n, r))).toEqual([50, 100, 200, 400]);
  });

  it('keeps equal-jitter delays between half and all of the delay', () => {
    for (const n of [1, 2, 3, 4]) {
      const full = 50 * 2 ** (n - 1);
      for (let i = 0; i < 100; i++) {
        const d = retryDelay({ ...base, backoff: 'exponential', jitter: true }, n, r);
        expect(Number.isInteger(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(full / 2);
        expect(d).toBeLessThanOrEqual(full);
      }
    }
  });
});

describe('call policies', () => {
  it('fails an attempt at sent + timeoutMs and ignores the late reply', () => {
    const result = simulate(direct({ timeoutMs: 50 }, [at(0)], [], 100));
    expect(result.requests[0]).toMatchObject({ status: 'failed', reason: 'api timed out after 50 ms', ms: 50 });
    expect(result.trace.find((e) => e.kind === 'timeout')).toMatchObject({ t: 50, caller: 'client', request: '#1', afterMs: 50 });
    expect(result.trace.find((e) => e.kind === 'late')).toMatchObject({ t: 110 });
  });

  it('treats a reply at the deadline as late (tie at the deadline)', () => {
    const result = simulate(direct({ timeoutMs: 50 }, [at(0)], [], 40));
    expect(result.requests[0]!.status).toBe('failed');
    expect(result.trace.find((e) => e.kind === 'late')).toMatchObject({ t: 50 });
  });

  it('retries refused calls and counts the tries', () => {
    const result = simulate(direct({ retry: { attempts: 2, backoff: 'none', baseMs: 0, jitter: false } }, [at(0)], [refuse(1000)]));
    expect(result.requests[0]).toMatchObject({ status: 'failed', attempts: 3 });
    expect(result.trace.filter((e) => e.kind === 'retry').map((e) => (e.kind === 'retry' ? e.attempt : 0))).toEqual([1, 2]);
  });

  it('succeeds on a retry once the outage ends', () => {
    const result = simulate(direct({ retry: { attempts: 3, backoff: 'fixed', baseMs: 50, jitter: false } }, [at(0)], [refuse(100)]));
    // Tries at 0, 60 and 120 ms; the third arrives at 125, after the outage.
    expect(result.requests[0]).toMatchObject({ status: 'ok', attempts: 3, ms: 140 });
  });

  it('does not retry a call its own breaker turns away', () => {
    const policy: CallPolicy = { breaker: { threshold: 1, openMs: 1000 }, retry: { attempts: 3, backoff: 'none', baseMs: 0, jitter: false } };
    const result = simulate(direct(policy, [at(0)], [refuse(1000)]));
    expect(result.requests[0]).toMatchObject({ status: 'failed', reason: 'circuit open', attempts: 1 });
  });

  it('moves the breaker closed → open → half-open → closed, or back to open', () => {
    const policy: CallPolicy = { breaker: { threshold: 2, openMs: 100 } };
    const requests = [at(0), at(20), at(40), at(160)];
    const recovers = simulate(direct(policy, requests, [refuse(150)]));
    const staysDown = simulate(direct(policy, requests, [refuse(5000)]));
    const states = (r: SimResult) => r.trace.flatMap((e) => (e.kind === 'breaker' ? [e.state] : [])).filter((s, i, all) => s !== all[i - 1]);
    expect(states(recovers)).toEqual(['closed', 'open', 'half-open', 'closed']);
    expect(states(staysDown)).toEqual(['closed', 'open', 'half-open', 'open']);
    expect(recovers.requests[2]).toMatchObject({ status: 'failed', reason: 'circuit open' });
    expect(recovers.requests[3]!.status).toBe('ok');
  });

  it('lets only the trial through while the breaker is half-open', () => {
    // Opens at 10 ms; at 130 ms #3 is the trial (api hangs, so it stays in flight) and #4 is turned away.
    const policy: CallPolicy = { timeoutMs: 100, breaker: { threshold: 1, openMs: 100 } };
    const result = simulate(direct(policy, [at(0), at(130), at(131)], [refuse(20), { kind: 'outage', node: 'api', from: 20, until: 5000, mode: 'hang' }]));
    expect(result.requests.map((r) => r.reason)).toEqual(['api-1 refused the connection', 'api timed out after 100 ms', 'circuit open']);
  });

  it('turns calls away when the pool is full and frees the slot when an attempt ends, even by timeout', () => {
    const nodes: NodeSpec[] = [
      client(),
      service('api', 1, [{ to: 'slow', policy: { timeoutMs: 30, bulkhead: { pool: 'p', size: 1 } } }]),
      service('slow', 2, [], { processMs: 200 }),
    ];
    const result = simulate({ nodes, links: [link('client', 'api'), link('api', 'slow')], requests: [at(0), at(1), at(60)], faults: [] });
    expect(result.requests.map((r) => r.reason)).toEqual(['slow timed out after 30 ms', 'bulkhead full', 'slow timed out after 30 ms']);
    const pools = result.trace.flatMap((e) => (e.kind === 'pool' ? [e.used] : []));
    expect(pools).toEqual([1, 0, 1, 0]);
  });

  it('adds no new event kinds to phase 1 lessons', () => {
    const phase1 = new Set<TraceEvent['kind']>(['send', 'arrive', 'handle', 'fail', 'register', 'heartbeat', 'evict', 'lookup', 'pick', 'route', 'reject', 'mark', 'fault', 'done']);
    const scenarios: Record<string, (values: Record<string, string>) => ReturnType<typeof loadBalancingScenario>> = {
      'monolith-vs-microservices': monolithVsMicroservicesScenario,
      'service-boundaries': serviceBoundariesScenario,
      'synchronous-calls': synchronousCallsScenario,
      'api-gateway': apiGatewayScenario,
      'service-discovery': serviceDiscoveryScenario,
      'load-balancing': loadBalancingScenario,
      'database-per-service': databasePerServiceScenario,
    };
    for (const [id, toScenario] of Object.entries(scenarios)) {
      const lesson = allLessons.find((l) => l.id === id)!;
      if (lesson.visualization.kind !== 'form') throw new Error(id);
      for (const preset of lesson.visualization.presets) {
        const read = toScenario(preset.values);
        if (!read.ok) throw new Error(read.why);
        const kinds = new Set(simulate(read.value).trace.map((e) => e.kind));
        for (const kind of kinds) expect(phase1.has(kind), `${id} ${preset.label}: ${kind}`).toBe(true);
      }
    }
  });
});
