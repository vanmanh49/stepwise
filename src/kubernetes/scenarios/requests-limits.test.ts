import { describe, expect, it } from 'vitest';
import type { Frame } from '../model';
import { simulate } from '../sim';
import { requestsLimitsScenario, requestsLimitsSteps } from './requests-limits';

const throttled = { qos: 'Burstable', cpuLimit: '500m', leak: 'off' };
const run = (values: Partial<typeof throttled>) => {
  const read = requestsLimitsScenario({ ...throttled, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const of = (frames: Frame[], kind: string) => frames.filter((f) => f.event.kind === kind);
const web = (frame: Frame) => frame.state.pods.filter((p) => p.owner?.startsWith('web'));

describe('Requests & Limits', () => {
  it('throttles CPU at the limit when traffic grows, and never kills for it', () => {
    const { frames, final } = run({});
    expect(of(frames, 'throttle').length).toBeGreaterThan(0);
    expect([...of(frames, 'exit'), ...of(frames, 'oom-kill'), ...of(frames, 'evict')]).toEqual([]);
    expect(final!.pods.filter((p) => p.owner?.startsWith('web')).every((p) => p.cpuUsage === 500 && p.throttled)).toBe(true);
  });

  it('OOMKills a leaking Guaranteed pod at its memory limit and restarts it', () => {
    const { frames } = run({ qos: 'Guaranteed', leak: 'on' });
    const oom = of(frames, 'oom-kill');
    expect(oom.length).toBeGreaterThan(0);
    expect(oom[0]!.event.text).toMatch(/over its 256 MiB limit/);
    expect(of(frames, 'restart').length).toBeGreaterThan(0);
    expect(of(frames, 'evict')).toEqual([]);
  });

  it('evicts the pod furthest over its memory request first: a leaking web pod before the BestEffort batch pod', () => {
    const { frames } = run({ qos: 'Burstable', cpuLimit: 'none', leak: 'on' });
    const evicts = of(frames, 'evict');
    expect(evicts[0]!.event.subjects[0]).toMatch(/^web-/);
    expect(evicts[0]!.event.text).toMatch(/\(Burstable, \d+ MiB over its request\)/);
    const pressured = requestsLimitsSteps({ ...throttled, cpuLimit: 'none', leak: 'on' }).some((s) => (s.view as import('../../types/visualization').ClusterView).nodes[0]!.memoryPressure);
    expect(pressured).toBe(true);
    // Usage is written in the same tick as the eviction, so the eviction's own frame holds the readings it compared.
    for (const f of evicts) {
      const victimOver = Number(/(\d+) MiB over its request/.exec(f.event.text)![1]);
      const others = f.state.pods.filter((p) => p.node === 'node-1' && p.phase === 'Running');
      expect(others.every((p) => (p.memoryUsage ?? 0) - (p.resources?.memory?.request ?? 0) <= victimOver)).toBe(true);
    }
  });

  it('gives the web pods the QoS class chosen', () => {
    for (const qos of ['BestEffort', 'Burstable', 'Guaranteed']) {
      const step = requestsLimitsSteps({ ...throttled, qos }).at(-1)!;
      const pods = (step.view as import('../../types/visualization').ClusterView).nodes.flatMap((n) => n.pods).filter((p) => p.name.startsWith('web'));
      expect(pods.every((p) => p.qos === qos)).toBe(true);
    }
    expect(web(run({ qos: 'Guaranteed' }).frames.at(-1)!).every((p) => p.resources?.cpu?.limit === 500)).toBe(true);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ qos: 'Gold' }, { cpuLimit: '2000m' }, { leak: 'maybe' }]) {
      const steps = requestsLimitsSteps({ ...throttled, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run these pods");
    }
  });
});
