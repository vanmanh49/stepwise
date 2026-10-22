import { describe, expect, it } from 'vitest';
import type { ServicesView } from '../../types/visualization';
import { simulate } from '../sim';
import { spansOf } from '../tracing';
import { distributedTracingScenario, distributedTracingSteps, sampledOf } from './distributed-tracing';

const values = (slow: string, propagate = 'on', sampling = 'all', requests = '5') => ({ slow, propagate, sampling, requests });
const spans = (v: Record<string, string>) => {
  const read = distributedTracingScenario(v);
  if (!read.ok) throw new Error(read.why);
  const result = simulate(read.value);
  const sampled = sampledOf(Number(v.requests), v.sampling === 'all' ? 1 : 0.1);
  return { result, spans: spansOf(read.value, result.trace, result.trace.length, { propagate: v.propagate === 'on', sampled }) };
};

describe('Distributed Tracing', () => {
  it("shows payments as the slow span in #3's trace", () => {
    const rows = spans(values('payments')).spans.get('#3')!;
    const active = rows.find((r) => r.role === 'active')!;
    expect(active.label).toMatch(/^payments /);
    expect(active.ms).toBeGreaterThanOrEqual(200);
    const step = distributedTracingSteps(values('payments')).find((s) => (s.view as ServicesView).spans?.title === 'trace of #3')!;
    expect(step).toBeDefined();
  });

  it('breaks the trace into separate pieces without propagation', () => {
    const rows = spans(values('payments', 'off')).spans.get('#3')!;
    expect(rows.every((r) => r.depth === 0)).toBe(true);
    expect(new Set(rows.map((r) => r.trace)).size).toBe(rows.length);
    const titles = distributedTracingSteps(values('payments', 'off')).map((s) => (s.view as ServicesView).spans?.title);
    expect(titles).toContain(`#3: ${rows.length} separate traces`);
  });

  it('keeps only #1 and #2 at 10 % sampling, so the slowdown leaves no trace', () => {
    const { result, spans: kept } = spans(values('payments', 'on', '10%'));
    expect([...kept.keys()]).toEqual(['#1', '#2']);
    for (const id of ['#1', '#2']) expect(kept.get(id)![0]!.ms).toBeLessThan(100);
    expect(result.requests[2]!.ms).toBeGreaterThan(200);
    expect(distributedTracingSteps(values('payments', 'on', '10%')).some((s) => (s.view as ServicesView).spans?.title === '#3 was not sampled')).toBe(true);
  });

  it('has no slow span when nothing is slow', () => {
    for (const rows of spans(values('none')).spans.values()) expect(rows.find((r) => r.role === 'active')!.ms).toBeLessThan(50);
  });

  it('names the slowest span as a step variable', () => {
    expect(distributedTracingSteps(values('payments')).at(-1)!.variables!['slowest span']).toMatch(/^payments \d+ ms$/);
  });

  it('refuses 0 requests', () => {
    expect(distributedTracingSteps(values('none', 'on', 'all', '0'))[0]!.why).toBe('Requests must be a whole number from 1 to 5.');
  });
});
