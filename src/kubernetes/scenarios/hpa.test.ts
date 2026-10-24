import { describe, expect, it } from 'vitest';
import type { Frame } from '../model';
import { simulate } from '../sim';
import { hpaScenario, hpaSteps } from './hpa';

const spike = { curve: 'spike', max: '8', target: '50' };
const run = (values: Partial<typeof spike>) => {
  const read = hpaScenario({ ...spike, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const replicas = (frames: Frame[]) => frames.filter((f) => f.event.kind === 'hpa').map((f) => [f.event.t, f.state.deployments[0]!.replicas] as const);

describe('Horizontal Pod Autoscaler lesson', () => {
  it('scales up for a spike, then back down after the stabilisation window', () => {
    const { frames, final } = run({});
    const steps = replicas(frames);
    expect(Math.max(...steps.map(([, r]) => r))).toBe(8);
    expect(final!.deployments[0]!.replicas).toBe(2);
    const down = steps.find(([, r], i) => i > 0 && r < steps[i - 1]![1])!;
    expect(down[0]).toBeGreaterThanOrEqual(70 + 30);
  });

  it('adds at most 4 pods or doubles them in one sync, as the default scale-up policy allows', () => {
    const steps = replicas(run({}).frames);
    expect(steps[0]![1]).toBe(6);
    expect(steps.every(([, r], i) => i === 0 || r <= Math.max(steps[i - 1]![1] + 4, steps[i - 1]![1] * 2))).toBe(true);
  });

  it('stops at max replicas and says so', () => {
    const { frames } = run({ max: '4' });
    expect(Math.max(...replicas(frames).map(([, r]) => r))).toBe(4);
    expect(frames.some((f) => f.event.text.includes('capped at max 4'))).toBe(true);
  });

  it('smooths flapping load: no scale-down until 30 s after the last high', () => {
    const steps = replicas(run({ curve: 'flapping' }).frames);
    const downs = steps.filter(([, r], i) => i > 0 && r < steps[i - 1]![1]);
    expect(downs.length).toBeGreaterThan(0);
    expect(downs.every(([t]) => t >= 80 + 30)).toBe(true);
  });

  it('runs more replicas for a lower target', () => {
    const peak = (target: string) => Math.max(...replicas(run({ target, max: '8' }).frames).map(([, r]) => r));
    expect(peak('80')).toBeLessThan(peak('30'));
  });

  it('follows a ramp up step by step', () => {
    const steps = replicas(run({ curve: 'ramp' }).frames);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.every(([, r], i) => i === 0 || r >= steps[i - 1]![1])).toBe(true);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ max: '3' }, { max: '9' }, { curve: 'zigzag' }, { target: '40' }]) {
      const steps = hpaSteps({ ...spike, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this autoscaler");
    }
  });
});
