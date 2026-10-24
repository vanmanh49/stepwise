import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { CronJob, Job, Scenario, Template } from '../model';
import { scenarioSteps } from './shared';

export const jobsCronjobsCode = `// Job controller, on every pod change
const want = Math.min(parallelism, completions - succeeded)
if (failed > backoffLimit) fail('BackoffLimitExceeded')
else if (now - startedAt > activeDeadlineSeconds) fail('DeadlineExceeded')
else if (succeeded >= completions) complete()
else if (running < want) createPod()    // after a back-off of 10 s, 20 s, … per failure

// CronJob controller, every 10 s
if (due(schedule))                      // "*/1 * * * *": every minute
  if (concurrencyPolicy === 'Forbid' && running) skip()
  else { if (concurrencyPolicy === 'Replace') deleteRunning(); createJob() }
deleteOldJobs()                         // keep 3 successful, 1 failed`;

export const MODES = ['Job', 'CronJob'];
export const FAILURES = ['none', 'first 2 fail', 'always fail', 'runs past a 60 s deadline'];
export const RESTART_POLICIES = ['Never', 'OnFailure'];
export const CONCURRENCY = ['Allow', 'Forbid', 'Replace'];
export const RUNTIMES = ['30 s', '90 s'];
const BACKOFF_LIMIT = 2;

export function jobsCronjobsScenario(values: Record<string, string>): Read<Scenario> {
  const mode = readChoice(values, 'mode', 'Run as', MODES);
  if (!mode.ok) return mode;
  const completions = readInt(values, 'completions', 'completions', { min: 1, max: 6 });
  if (!completions.ok) return completions;
  const parallelism = readInt(values, 'parallelism', 'parallelism', { min: 1, max: 3 });
  if (!parallelism.ok) return parallelism;
  const failures = readChoice(values, 'failures', 'Failures', FAILURES);
  if (!failures.ok) return failures;
  const restartPolicy = readChoice(values, 'restartPolicy', 'restartPolicy', RESTART_POLICIES);
  if (!restartPolicy.ok) return restartPolicy;
  const concurrency = readChoice(values, 'concurrency', 'concurrencyPolicy', CONCURRENCY);
  if (!concurrency.ok) return concurrency;
  const runtime = readChoice(values, 'runtime', 'Each pod runs for', RUNTIMES);
  if (!runtime.ok) return runtime;
  const late = failures.value === 'runs past a 60 s deadline';
  const run: NonNullable<Template['run']> = {
    seconds: late ? 90 : parseInt(runtime.value, 10),
    exitCode: failures.value === 'always fail' ? 1 : 0,
    ...(failures.value === 'first 2 fail' && { failFirst: 2 }),
  };
  const template: Template = { labels: { app: 'report' }, image: 'report:v1', cpu: 1, restartPolicy: restartPolicy.value as Template['restartPolicy'], run };
  const spec = { template, completions: completions.value, parallelism: parallelism.value, backoffLimit: BACKOFF_LIMIT, ...(late && { activeDeadlineS: 60 }) };
  const object: Job | CronJob =
    mode.value === 'Job'
      ? { kind: 'Job', name: 'report', ...spec, status: { active: 0, succeeded: 0, failed: 0 } }
      : { kind: 'CronJob', name: 'report', schedule: '*/1 * * * *', jobTemplate: spec, concurrencyPolicy: concurrency.value as CronJob['concurrencyPolicy'], successfulHistory: 3, failedHistory: 1 };
  const cron = mode.value === 'CronJob';
  return { ok: true, value: { nodes: [{ name: 'node-1', cpu: 4 }, { name: 'node-2', cpu: 4 }], actions: [{ at: 0, kind: 'apply', object }], faults: [], until: cron ? 330 : 300, ...(cron && { runToEnd: true }) } };
}

export function jobsCronjobsSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(jobsCronjobsScenario(values), "Can't run this Job", {
    code: jobsCronjobsCode,
    lines: { 'create-pod': 'createPod()', exit: 'const want', restart: 'createPod()', 'back-off': 'createPod()', cron: 'createJob()', 'delete-pod': "fail('BackoffLimitExceeded')" },
    explain: (event) => {
      if (event.kind === 'job' && event.text.includes('Complete')) return { line: 'complete()', why: 'Enough pods have finished with exit code 0, so the Job is Complete. Its pods stay, Completed, so you can read their logs.' };
      if (event.kind === 'job' && event.text.includes('BackoffLimitExceeded')) return { line: "fail('BackoffLimitExceeded')", why: `More pods have failed than backoffLimit allows (${BACKOFF_LIMIT} here; 6 by default), so the Job gives up and is Failed.` };
      if (event.kind === 'job' && event.text.includes('DeadlineExceeded')) return { line: "fail('DeadlineExceeded')", why: 'The Job has been running longer than activeDeadlineSeconds. Kubernetes stops its pods and marks it Failed, whatever backoffLimit says.' };
      if (event.kind === 'job') return { line: 'createPod()', why: 'After a failure the Job controller waits before the next pod: 10 s, then 20 s, then 40 s, doubling up to 10 minutes.' };
      if (event.kind === 'cron' && event.text.includes('skips')) return { line: 'skip()', why: 'concurrencyPolicy Forbid: the last run is still going, so this one is skipped, not queued.' };
      if (event.kind === 'cron' && event.text.includes('(Replace)')) return { line: 'deleteRunning()', why: 'concurrencyPolicy Replace: the run still going is deleted, pods and all, to make room for the new one.' };
      if (event.kind === 'cron' && event.text.includes('keeps')) return { line: 'deleteOldJobs()', why: 'CronJobs keep a few finished Jobs for their logs (3 successful and 1 failed by default) and delete older ones.' };
      if (event.kind === 'cron') return { why: 'A run is due on the schedule, so the CronJob controller creates a Job for it. From here, the Job controller takes over.' };
      return undefined;
    },
  });
}
