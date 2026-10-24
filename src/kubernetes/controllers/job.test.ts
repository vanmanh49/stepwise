import { describe, expect, it } from 'vitest';
import { nodesOf } from '../fixtures.testutil';
import type { Frame, Job, Template } from '../model';
import { simulate } from '../sim';

const work = (extra: Partial<Template> = {}, run: Template['run'] = { seconds: 10, exitCode: 0 }): Template => ({ labels: { app: 'report' }, image: 'report:v1', cpu: 1, restartPolicy: 'Never', run, ...extra });
export const jobOf = (extra: Partial<Job> = {}, template = work()): Job => ({ kind: 'Job', name: 'report', template, completions: 1, parallelism: 1, backoffLimit: 2, status: { active: 0, succeeded: 0, failed: 0 }, ...extra });
const run = (job: Job, until = 300) => simulate({ nodes: nodesOf(3), actions: [{ at: 0, kind: 'apply', object: job }], faults: [], until });
const active = (f: Frame) => f.state.pods.filter((p) => p.ownerKind === 'Job' && p.phase !== 'Completed' && p.phase !== 'Failed');
const done = (f: Frame) => f.state.pods.filter((p) => p.ownerKind === 'Job' && p.phase === 'Completed').length;

describe('Job controller', () => {
  it('runs at most parallelism pods until enough succeed', () => {
    const { frames, final } = run(jobOf({ completions: 6, parallelism: 3 }));
    expect(Math.max(...frames.map((f) => active(f).length))).toBe(3);
    expect(Math.max(...frames.map(done))).toBe(6);
    expect(final!.jobs[0]!.status).toMatchObject({ succeeded: 6, condition: 'Complete' });
  });

  it('never runs more pods than the work left', () => {
    const { frames } = run(jobOf({ completions: 4, parallelism: 3 }));
    for (const f of frames) expect(active(f).length + done(f)).toBeLessThanOrEqual(4);
  });

  it('replaces failed pods after a back-off of 10 s, then 20 s', () => {
    const { frames, final } = run(jobOf({}, work({}, { seconds: 5, exitCode: 0, failFirst: 2 })));
    const fails = frames.filter((f) => f.event.kind === 'exit' && f.event.text.includes('code 1')).map((f) => f.event.t);
    const creates = frames.filter((f) => f.event.kind === 'create-pod').map((f) => f.event.t);
    expect(fails).toHaveLength(2);
    expect(creates).toHaveLength(3);
    expect(creates[1]! - fails[0]!).toBeGreaterThanOrEqual(10);
    expect(creates[2]! - fails[1]!).toBeGreaterThanOrEqual(20);
    expect(final!.jobs[0]!.status).toMatchObject({ succeeded: 1, failed: 2, condition: 'Complete' });
  });

  it('fails with BackoffLimitExceeded once failures pass the limit', () => {
    const { final } = run(jobOf({ backoffLimit: 2 }, work({}, { seconds: 5, exitCode: 1 })));
    expect(final!.jobs[0]!.status).toMatchObject({ failed: 3, condition: 'Failed', reason: 'BackoffLimitExceeded' });
    expect(final!.pods.filter((p) => p.phase === 'Failed')).toHaveLength(3);
  });

  it('fails with DeadlineExceeded and stops its pods at the deadline', () => {
    const { frames, final } = run(jobOf({ activeDeadlineS: 60 }, work({}, { seconds: 90, exitCode: 0 })));
    const failed = frames.find((f) => f.state.jobs[0]?.status.condition === 'Failed')!;
    expect(failed.state.jobs[0]!.status.reason).toBe('DeadlineExceeded');
    expect(failed.event.t).toBe(failed.state.jobs[0]!.status.startedAt! + 60);
    expect(active({ ...failed, state: final! })).toEqual([]);
  });

  it('counts in-place restarts as failures with OnFailure', () => {
    const { final } = run(jobOf({}, work({ restartPolicy: 'OnFailure' }, { seconds: 5, exitCode: 0, failFirst: 2 })));
    expect(final!.pods).toHaveLength(1);
    expect(final!.pods[0]!.restarts).toBe(2);
    expect(final!.jobs[0]!.status).toMatchObject({ succeeded: 1, failed: 2, condition: 'Complete' });
  });
});
