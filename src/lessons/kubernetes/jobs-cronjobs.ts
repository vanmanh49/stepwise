import { CONCURRENCY, FAILURES, jobsCronjobsCode, jobsCronjobsSteps, MODES, RESTART_POLICIES, RUNTIMES } from '../../kubernetes/scenarios/jobs-cronjobs';
import type { LessonContent } from '../../types/lesson';

const batch = { mode: 'Job', completions: '6', parallelism: '3', failures: 'none', restartPolicy: 'Never', concurrency: 'Allow', runtime: '30 s' };
const cron = { ...batch, mode: 'CronJob', completions: '1', parallelism: '1' };
const forbid = { ...cron, runtime: '90 s', concurrency: 'Forbid' };

// Two minutes in: the 90 s run from minute 1 is still going when minute 2 is due.
const steps = jobsCronjobsSteps(forbid);
const due = steps.find((s) => s.title.includes('skips'))!;

const content: LessonContent = {
  overview:
    'Not everything runs forever. Reports, migrations and backups do their work and stop. A Job runs pods until enough of them succeed, retrying failures. A CronJob creates a Job on a schedule, like cron. This lesson runs a batch, makes it fail in different ways, then schedules it every minute.',
  concept: [
    'A Job wants completions successful pods, with at most parallelism running at once. Pods use restartPolicy Never or OnFailure; Always is refused, because a Job\'s pods must be able to finish.',
    'A failed pod is retried after a back-off (10 s, 20 s, 40 s, … up to 10 minutes). With OnFailure the same pod restarts in place; with Never a new pod replaces it. Either way each failure counts.',
    'More failures than backoffLimit (6 by default; 2 here) fail the Job with BackoffLimitExceeded. Running longer than activeDeadlineSeconds fails it with DeadlineExceeded, whatever the back-off limit.',
    'A CronJob checks its schedule every 10 s and creates a Job when a run is due. "*/1 * * * *" means every minute; the first run is the first scheduled minute after the CronJob was made.',
    'concurrencyPolicy decides what happens if the last run is still going: Allow runs them side by side, Forbid skips the new run, Replace deletes the old one. Old Jobs are cleaned up beyond the history limits (3 successful, 1 failed by default).',
  ],
  howItWorks: [
    'Job report runs pods that each work for 30 or 90 s and then exit. Pick completions and parallelism to see the batch spread out.',
    'Failures: the first 2 pods fail before one succeeds, every pod fails, or pods run 90 s against a 60 s deadline.',
    'restartPolicy Never replaces a failed pod with a new one; OnFailure restarts the same pod in place. Both count towards backoffLimit.',
    'As a CronJob, report runs every minute for 5 minutes. With 90 s runs they overlap, so concurrencyPolicy matters.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'mode', label: 'Run as', type: 'choice', sample: batch.mode, options: MODES },
      { name: 'completions', label: 'completions', type: 'number', sample: batch.completions, help: 'From 1 to 6 successful pods.' },
      { name: 'parallelism', label: 'parallelism', type: 'number', sample: batch.parallelism, help: 'From 1 to 3 pods at once.' },
      { name: 'failures', label: 'Failures', type: 'choice', sample: batch.failures, options: FAILURES },
      { name: 'restartPolicy', label: 'restartPolicy', type: 'choice', sample: batch.restartPolicy, options: RESTART_POLICIES },
      { name: 'concurrency', label: 'concurrencyPolicy (CronJob)', type: 'choice', sample: batch.concurrency, options: CONCURRENCY },
      { name: 'runtime', label: 'Each pod runs for', type: 'choice', sample: batch.runtime, options: RUNTIMES },
    ],
    presets: [
      { label: 'Parallel batch', values: batch },
      { label: 'Retries until it succeeds', values: { ...batch, completions: '1', parallelism: '1', failures: 'first 2 fail' } },
      { label: 'Backoff limit exceeded', values: { ...batch, completions: '1', parallelism: '1', failures: 'always fail' } },
      { label: 'Deadline exceeded', values: { ...batch, completions: '1', parallelism: '1', failures: 'runs past a 60 s deadline' } },
      { label: 'CronJob every minute', values: cron },
      { label: 'Forbid skips overlapping runs', values: forbid },
      { label: 'Replace cancels the old run', values: { ...forbid, concurrency: 'Replace' } },
    ],
    generate: jobsCronjobsSteps,
    codeLabel: 'Pseudocode',
  },
  code: jobsCronjobsCode,
  prosCons: {
    pros: ['Batch work retries itself and stops when done', 'parallelism spreads work over the cluster', 'CronJobs replace a cron server, with history and logs'],
    cons: ['Retries can repeat side effects: work must be safe to run twice', 'A CronJob can miss or skip runs', 'Finished pods linger until their Job is cleaned up'],
    useWhen: ['Reports, data imports, database migrations, backups, nightly clean-ups'],
    avoidWhen: ['Long-running services: use a Deployment', 'Work every few seconds: a CronJob runs at most once a minute'],
  },
  applications: [
    'A database migration as a Job before a release',
    'A nightly backup CronJob with concurrencyPolicy Forbid',
    'kubectl create job --from=cronjob/report report-now to run a CronJob by hand',
  ],
  commonMistakes: [
    'restartPolicy Always in a Job (refused) or forgetting that OnFailure restarts count as failures.',
    'Allow on a CronJob whose runs outlast the schedule, so they pile up.',
    'Work that isn\'t idempotent, run twice after a retry.',
    'No activeDeadlineSeconds on a Job that can hang.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'concurrencyPolicy is Forbid. The 90 s run from minute 1 is still going when minute 2 is due. What happens?',
      view: due.view,
      options: ['The minute 2 run is skipped', 'Both run side by side', 'The minute 1 run is deleted', 'The minute 2 run waits and starts later'],
      answer: 0,
      explanation: 'Forbid skips a run while another is active. It doesn\'t queue it.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'completions 6, parallelism 3. How many pods run at once at the start?',
      options: ['3', '6', '1', '2'],
      answer: 0,
      explanation: 'parallelism caps the pods running at once; the Job keeps going until 6 have succeeded.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line ends a Job whose pods keep failing?',
      code: "if (failed > backoffLimit) fail('BackoffLimitExceeded')\nelse if (succeeded >= completions) complete()\nelse if (running < want) createPod()",
      options: ["fail('BackoffLimitExceeded')", 'complete()', 'createPod()', 'None: Jobs retry forever'],
      answer: 0,
      explanation: 'Once failures pass backoffLimit, the Job is Failed and no more pods are made.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A Job pod runs for 90 s and activeDeadlineSeconds is 60. What happens?',
      options: ['At 60 s the pod is stopped and the Job fails with DeadlineExceeded', 'It finishes at 90 s', 'It is retried with a longer deadline', 'The deadline only counts failed pods'],
      answer: 0,
      explanation: 'The deadline applies to the whole Job, whatever backoffLimit says.',
    },
  ],
  summary: [
    'A Job runs pods until completions succeed, parallelism at a time.',
    'Failures retry with a growing back-off, up to backoffLimit.',
    'activeDeadlineSeconds caps how long a Job may run.',
    'A CronJob makes Jobs on a schedule; concurrencyPolicy handles overlaps.',
  ],
};

export default content;
