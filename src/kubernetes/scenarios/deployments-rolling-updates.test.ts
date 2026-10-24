import { describe, expect, it } from 'vitest';
import { resolveAmount, type Amount, type Frame } from '../model';
import { simulate } from '../sim';
import { deploymentsRollingUpdatesScenario, deploymentsRollingUpdatesSteps } from './deployments-rolling-updates';

const base = { replicas: '4', surge: '25%', unavailable: '25%', image: 'good', rollback: 'off' };
type Values = typeof base;
const run = (values: Partial<Values>) => {
  const read = deploymentsRollingUpdatesScenario({ ...base, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).frames;
};
const amount = (text: string): Amount => (text.endsWith('%') ? (text as Amount) : Number(text));
const final = (frames: Frame[]) => frames.at(-1)!.state;

const presets: Partial<Values>[] = [{}, { surge: '1', unavailable: '0' }, { surge: '0', unavailable: '1' }, { image: 'bad' }, { image: 'bad', rollback: 'on' }];

describe('Deployments & Rolling Updates', () => {
  it.each(presets)('keeps every frame within maxSurge and maxUnavailable (%o)', (values) => {
    const v = { ...base, ...values };
    const replicas = Number(v.replicas);
    const maxTotal = replicas + resolveAmount(amount(v.surge), replicas, 'up');
    const minReady = replicas - resolveAmount(amount(v.unavailable), replicas, 'down');
    for (const frame of run(values).filter((f) => f.event.t >= 15)) {
      expect(frame.state.pods.length, frame.event.text).toBeLessThanOrEqual(maxTotal);
      expect(frame.state.pods.filter((p) => p.ready).length, frame.event.text).toBeGreaterThanOrEqual(minReady);
    }
  });

  it('ends with every pod on v2 after a good rollout', () => {
    const state = final(run({}));
    expect(state.pods.map((p) => [p.image, p.ready])).toEqual(Array.from({ length: 4 }, () => ['app:v2', true]));
    expect(state.replicaSets.map((rs) => [rs.template.image, rs.replicas]).toSorted()).toEqual([
      ['app:v1', 0],
      ['app:v2', 4],
    ]);
  });

  it('never drops below 4 ready pods with surge 1 and unavailable 0', () => {
    expect(run({ surge: '1', unavailable: '0' }).filter((f) => f.event.t >= 15).every((f) => f.state.pods.filter((p) => p.ready).length >= 4)).toBe(true);
  });

  it('stalls a bad image with v1 still serving 3 pods', () => {
    const state = final(run({ image: 'bad' }));
    expect(state.pods.filter((p) => p.image === 'app:v1' && p.ready)).toHaveLength(3);
    expect(state.pods.filter((p) => p.image === 'app:v2-typo').map((p) => p.phase)).toEqual(['ImagePullBackOff', 'ImagePullBackOff']);
  });

  it('sums up same-second pull failures in one short title', () => {
    const titles = deploymentsRollingUpdatesSteps({ ...base, image: 'bad' }).map((s) => s.title);
    expect(titles.some((t) => /^kubelets can't pull app:v2-typo for 2 pods: web-\w+-\w{3}, web-\w+-\w{3} \(ErrImagePull\)$/.test(t))).toBe(true);
  });

  it('rolls back to 4 ready v1 pods', () => {
    const state = final(run({ image: 'bad', rollback: 'on' }));
    expect(state.pods.map((p) => [p.image, p.ready])).toEqual(Array.from({ length: 4 }, () => ['app:v1', true]));
    expect(state.replicaSets.find((rs) => rs.template.image === 'app:v2-typo')!.replicas).toBe(0);
  });

  it('refuses maxSurge and maxUnavailable that are both 0', () => {
    for (const bad of [
      { surge: '0', unavailable: '0' },
      { replicas: '2', surge: '0', unavailable: '25%' },
    ]) {
      const steps = deploymentsRollingUpdatesSteps({ ...base, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this rollout");
      expect(steps[0]!.why).toBe("maxSurge and maxUnavailable can't both be 0: the rollout could never start.");
    }
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ replicas: '1' }, { replicas: '7' }, { surge: '50%' }, { image: 'ok' }, { rollback: 'yes' }]) {
      expect(deploymentsRollingUpdatesSteps({ ...base, ...bad })).toHaveLength(1);
    }
  });
});
