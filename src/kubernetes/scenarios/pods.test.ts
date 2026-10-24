import { describe, expect, it } from 'vitest';
import type { Frame } from '../model';
import { simulate } from '../sim';
import { podsScenario, podsSteps } from './pods';

const crashes = { policy: 'Always', exit: '1', crashAfter: '5' };
const run = (values: Partial<typeof crashes>) => {
  const read = podsScenario({ ...crashes, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const at = (frames: Frame[], kind: string) => frames.filter((f) => f.event.kind === kind).map((f) => f.event.t);
const gaps = (frames: Frame[]) => at(frames, 'restart').map((t, i) => t - at(frames, 'exit')[i]!);

describe('Pods', () => {
  it('restarts a crashing pod with a doubling back-off, counting restarts', () => {
    const { frames, cutOff } = run({});
    expect(gaps(frames)).toEqual([10, 20, 40, 80, 160]);
    expect(frames.at(-1)!.state.pods[0]!.restarts).toBe(5);
    expect(cutOff).toBe(true);
  });

  it('keeps the same back-off when the container runs 15 s, because it never runs 60 s', () => {
    expect(gaps(run({ crashAfter: '15' }).frames)).toEqual([10, 20, 40, 80, 160]);
  });

  it('restarts after exit 0 too when the policy is Always', () => {
    expect(at(run({ exit: '0' }).frames, 'restart').length).toBeGreaterThan(0);
  });

  it('completes on exit 0 under OnFailure, with no restart', () => {
    const { frames, cutOff } = run({ policy: 'OnFailure', exit: '0' });
    expect(frames.at(-1)!.state.pods[0]!.phase).toBe('Completed');
    expect(at(frames, 'restart')).toEqual([]);
    expect(cutOff).toBe(false);
  });

  it('restarts on exit 1 under OnFailure', () => {
    expect(at(run({ policy: 'OnFailure' }).frames, 'restart').length).toBeGreaterThan(0);
  });

  it('stays Failed under Never', () => {
    const { frames } = run({ policy: 'Never' });
    expect(frames.at(-1)!.state.pods[0]!.phase).toBe('Failed');
    expect(at(frames, 'restart')).toEqual([]);
  });

  it('ends a crash loop with a summary of the restarts', () => {
    expect(podsSteps(crashes).at(-1)!.title).toBe('After 400 s: pod web is CrashLoopBackOff after 5 restarts');
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ policy: 'Sometimes' }, { exit: '2' }, { crashAfter: '7' }]) {
      const steps = podsSteps({ ...crashes, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this pod");
    }
  });
});

describe('Pods lesson wording', () => {
  it('calls CrashLoopBackOff a status, not a phase, and names the five real phases', async () => {
    const { podsCode } = await import('./pods');
    const lesson = (await import('../../lessons/kubernetes/pods')).default;
    expect(podsCode).not.toContain('pod.phase');
    expect(podsCode).toContain("pod.status = 'CrashLoopBackOff'");
    expect(lesson.concept.join(' ')).toMatch(/Pending, Running, Succeeded, Failed and Unknown/);
  });
});
