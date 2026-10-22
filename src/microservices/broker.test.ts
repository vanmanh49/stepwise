import { describe, expect, it } from 'vitest';
import type { Fault, NodeSpec, Scenario } from './model';
import { simulate } from './sim';
import { broker, client, link, service } from './scenarios/shared';

/** client → jobs broker → consumers; requests to the broker at the given times. */
function system(mode: 'queue' | 'topic', consumers: NodeSpec[], times: number[], faults: Fault[] = []): Scenario {
  return {
    nodes: [client(), broker('jobs', 1, mode, consumers.map((c) => c.id)), ...consumers],
    links: [link('client', 'jobs'), ...consumers.map((c) => link('jobs', c.id))],
    requests: times.map((at) => ({ label: 'POST /job', path: '/job', to: 'jobs', at })),
    faults,
  };
}
const worker = (count = 1) => service('worker', 2, [], { count, processMs: 60 });
const refuse = (until: number): Fault => ({ kind: 'outage', node: 'worker', from: 0, until, mode: 'refuse' });

describe('broker', () => {
  it('gives each queued message to exactly one free worker instance', () => {
    const result = simulate(system('queue', [worker(2)], [0, 0, 0, 0]));
    expect(result.deliveries.map((d) => d.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(new Set(result.deliveries.map((d) => d.consumer))).toEqual(new Set(['worker-1', 'worker-2']));
    expect(result.deliveries.map((d) => d.attempts)).toEqual([1, 1, 1, 1]);
  });

  it('copies each message into every subscriber queue in topic mode', () => {
    const result = simulate(system('topic', [service('a', 2), service('b', 2)], [0, 50]));
    expect(result.deliveries.map((d) => d.id)).toEqual(['#1/a', '#1/b', '#2/a', '#2/b']);
    expect(result.deliveries.map((d) => d.label)).toEqual(['POST /job → a', 'POST /job → b', 'POST /job → a', 'POST /job → b']);
    expect(result.deliveries.every((d) => d.status === 'ok')).toBe(true);
  });

  it('answers the producer once the message is stored', () => {
    expect(simulate(system('queue', [worker()], [0])).requests[0]).toMatchObject({ status: 'ok', ms: 12 });
  });

  it('never gives one instance two unacked messages', () => {
    const result = simulate(system('queue', [worker()], [0, 0, 0]));
    let open = 0;
    for (const e of result.trace) {
      if (e.kind === 'send' && e.message.kind === 'deliver') open++;
      if (e.kind === 'arrive' && e.message.kind === 'reply' && e.message.to === 'jobs') open--;
      expect(open).toBeLessThanOrEqual(1);
    }
    expect(result.deliveries.every((d) => d.status === 'ok')).toBe(true);
  });

  it('requeues a refused delivery and redelivers it after redeliverMs', () => {
    const result = simulate(system('queue', [worker()], [0], [refuse(100)]));
    const requeues = result.trace.filter((e) => e.kind === 'requeue');
    expect(requeues.length).toBeGreaterThan(0);
    const sends = result.trace.filter((e) => e.kind === 'send' && e.message.kind === 'deliver').map((e) => e.t);
    expect(sends[1]! - sends[0]!).toBe(50 + 10);
    expect(result.deliveries[0]).toMatchObject({ status: 'ok' });
    expect(result.deliveries[0]!.attempts).toBeGreaterThan(1);
    expect(result.deliveries[0]!.ms).toBeGreaterThan(100);
  });

  it('keeps running until every delivery is acked', () => {
    const result = simulate(system('queue', [worker()], [0, 0, 0]));
    const acked = result.trace.filter((e) => e.kind === 'delivered').map((e) => e.t);
    expect(acked).toHaveLength(3);
    expect(result.endedAt).toBeGreaterThanOrEqual(Math.max(...acked));
  });

  it('fails deliveries still open at MAX_TIME', () => {
    const result = simulate(system('queue', [worker()], [0, 0], [refuse(20_000)]));
    expect(result.requests.every((r) => r.status === 'ok')).toBe(true);
    expect(result.deliveries.every((d) => d.status === 'failed' && d.reason === 'not processed by 10,000 ms')).toBe(true);
  });

  it('publishes from a service call with the call label', () => {
    const result = simulate({
      nodes: [client(), service('orders', 1, [{ to: 'events', label: 'OrderPlaced' }]), broker('events', 2, 'topic', ['email']), service('email', 3)],
      links: [link('client', 'orders'), link('orders', 'events'), link('events', 'email')],
      requests: [{ label: 'POST /orders', path: '/orders', to: 'orders', at: 0 }],
      faults: [],
    });
    expect(result.requests[0]!.status).toBe('ok');
    expect(result.deliveries).toMatchObject([{ id: '#1/email', label: 'OrderPlaced → email', status: 'ok', consumer: 'email-1' }]);
  });
});
