import { describe, expect, it } from 'vitest';
import type { Frame } from '../model';
import { simulate } from '../sim';
import { jobsCronjobsScenario, jobsCronjobsSteps } from './jobs-cronjobs';

const batch = { mode: 'Job', completions: '6', parallelism: '3', failures: 'none', restartPolicy: 'Never', concurrency: 'Allow', runtime: '30 s' };
const cron = { ...batch, mode: 'CronJob', completions: '1', parallelism: '1' };
const run = (values: Partial<typeof batch>) => {
  const read = jobsCronjobsScenario({ ...batch, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const activeJobs = (f: Frame) => f.state.jobs.filter((j) => !j.status.condition).length;
const running = (f: Frame) => f.state.pods.filter((p) => p.ownerKind === 'Job' && p.phase !== 'Completed' && p.phase !== 'Failed').length;

describe('Jobs & CronJobs', () => {
  it('runs a batch three at a time until six succeed', () => {
    const { frames, final } = run({});
    expect(Math.max(...frames.map(running))).toBe(3);
    expect(final!.jobs[0]!.status).toMatchObject({ succeeded: 6, condition: 'Complete' });
  });

  it('retries failed pods until the work succeeds', () => {
    const { final } = run({ completions: '1', parallelism: '1', failures: 'first 2 fail' });
    expect(final!.jobs[0]!.status).toMatchObject({ failed: 2, succeeded: 1, condition: 'Complete' });
  });

  it('gives up after the backoff limit', () => {
    expect(run({ completions: '1', parallelism: '1', failures: 'always fail' }).final!.jobs[0]!.status).toMatchObject({ condition: 'Failed', reason: 'BackoffLimitExceeded' });
  });

  it('stops a Job that runs past its deadline', () => {
    expect(run({ completions: '1', parallelism: '1', failures: 'runs past a 60 s deadline' }).final!.jobs[0]!.status).toMatchObject({ condition: 'Failed', reason: 'DeadlineExceeded' });
  });

  it('makes a Job every minute from a CronJob', () => {
    const { frames } = run(cron);
    const made = frames.filter((f) => f.event.kind === 'cron' && f.event.text.includes('creates Job')).map((f) => f.event.t);
    expect(made).toEqual([60, 120, 180, 240, 300]);
  });

  it('skips overlapping runs with Forbid', () => {
    const { frames } = run({ ...cron, runtime: '90 s', concurrency: 'Forbid' });
    expect(Math.max(...frames.map(activeJobs))).toBe(1);
    expect(frames.some((f) => f.event.kind === 'cron' && f.event.text.includes('skips'))).toBe(true);
  });

  it('cancels the old run with Replace', () => {
    const { frames } = run({ ...cron, runtime: '90 s', concurrency: 'Replace' });
    expect(Math.max(...frames.map(activeJobs))).toBe(1);
    expect(frames.some((f) => f.event.kind === 'cron' && f.event.text.includes('(Replace)'))).toBe(true);
  });

  it('lets runs overlap with Allow', () => {
    expect(Math.max(...run({ ...cron, runtime: '90 s' }).frames.map(activeJobs))).toBe(2);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ completions: '0' }, { completions: '7' }, { parallelism: '4' }, { mode: 'Pod' }, { restartPolicy: 'Always' }]) {
      const steps = jobsCronjobsSteps({ ...batch, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this Job");
    }
  });
});
