import { describe, expect, it } from 'vitest';
import { nodesOf } from '../fixtures.testutil';
import type { CronJob, Frame } from '../model';
import { simulate } from '../sim';

const cron = (concurrencyPolicy: CronJob['concurrencyPolicy'], seconds: number, exitCode: 0 | 1 = 0): CronJob => ({
  kind: 'CronJob',
  name: 'report',
  schedule: '*/1 * * * *',
  jobTemplate: { template: { labels: { app: 'report' }, image: 'report:v1', cpu: 1, restartPolicy: 'Never', run: { seconds, exitCode } }, completions: 1, parallelism: 1, backoffLimit: 0 },
  concurrencyPolicy,
  successfulHistory: 3,
  failedHistory: 1,
});
const run = (c: CronJob, until = 300) => simulate({ nodes: nodesOf(3), actions: [{ at: 0, kind: 'apply', object: c }], faults: [], until, runToEnd: true });
const activeJobs = (f: Frame) => f.state.jobs.filter((j) => !j.status.condition).length;
const created = (frames: Frame[]) => frames.filter((f) => f.event.kind === 'cron' && f.event.text.includes('creates'));

describe('CronJob controller', () => {
  it('creates a Job every minute after it was made', () => {
    const { frames } = run(cron('Allow', 30));
    expect(created(frames).map((f) => [f.event.t, f.event.subjects[0]])).toEqual([
      [60, 'report-1'],
      [120, 'report-2'],
      [180, 'report-3'],
      [240, 'report-4'],
      [300, 'report-5'],
    ]);
  });

  it('lets runs overlap with Allow', () => {
    expect(Math.max(...run(cron('Allow', 90)).frames.map(activeJobs))).toBe(2);
  });

  it('skips a run while one is active with Forbid, telling each skip once', () => {
    const { frames } = run(cron('Forbid', 90), 600);
    expect(Math.max(...frames.map(activeJobs))).toBe(1);
    const skips = frames.filter((f) => f.event.kind === 'cron' && f.event.text.includes('skips'));
    expect(skips.length).toBeGreaterThan(0);
    expect(new Set(skips.map((f) => f.event.t)).size).toBe(skips.length);
  });

  it('replaces the running Job with Replace', () => {
    const { frames } = run(cron('Replace', 90));
    expect(Math.max(...frames.map(activeJobs))).toBe(1);
    expect(frames.some((f) => f.event.kind === 'cron' && f.event.text.includes('deletes report-1'))).toBe(true);
  });

  it('keeps 3 succeeded and 1 failed Job, with no pods left behind', () => {
    for (const [code, kept] of [[0, 3], [1, 1]] as const) {
      const { final } = run(cron('Allow', 10, code), 600);
      expect(final!.jobs.filter((j) => j.status.condition)).toHaveLength(kept);
      const jobs = new Set(final!.jobs.map((j) => j.name));
      expect(final!.pods.every((p) => jobs.has(p.owner!))).toBe(true);
    }
  });
});
