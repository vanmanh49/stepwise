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

  it('evicts the BestEffort batch pod first when leaking Burstable pods fill the node, then a Burstable pod over its request', () => {
    const { frames } = run({ qos: 'Burstable', cpuLimit: 'none', leak: 'on' });
    const evicts = of(frames, 'evict');
    expect(evicts[0]!.event.subjects[0]).toMatch(/^batch-/);
    expect(evicts[0]!.event.text).toMatch(/\(BestEffort\)/);
    // A web pod goes only when no BestEffort pod is running on the node (batch's replacements go first each time).
    const webEvicts = evicts.filter((f) => f.event.subjects[0]!.startsWith('web-'));
    expect(webEvicts.length).toBeGreaterThan(0);
    const pressured = requestsLimitsSteps({ ...throttled, cpuLimit: 'none', leak: 'on' }).some((s) => (s.view as import('../../types/visualization').ClusterView).nodes[0]!.memoryPressure);
    expect(pressured).toBe(true);
    for (const f of webEvicts) {
      const before = frames[frames.indexOf(f) - 1]!.state;
      expect(before.pods.some((p) => p.owner?.startsWith('batch') && p.phase === 'Running')).toBe(false);
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
