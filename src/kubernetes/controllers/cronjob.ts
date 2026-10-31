import type { Env } from '../env';
import type { CronJob, Job } from '../model';
import { podsOfJob } from './job';

/** Seconds between runs for a schedule of the form "*\/N * * * *" (every N minutes); undefined for anything else. */
function periodOf(schedule: string): number | undefined {
  const match = /^\*\/([1-9]\d*) \* \* \* \*$/.exec(schedule);
  return match ? Number(match[1]) * 60 : undefined;
}

const by = { by: 'controllers' as const };
const order = (a: Job, b: Job) => (a.status.startedAt ?? 0) - (b.status.startedAt ?? 0) || (a.name < b.name ? -1 : 1);

function remove(env: Env, job: Job, text: string) {
  for (const pod of podsOfJob(env, job)) env.store.write({ op: 'delete', object: pod });
  env.apply({ write: { op: 'delete', object: job }, event: { kind: 'cron', ...by, subjects: [job.name], text } });
}

/**
 * The CronJob controller, every 10 s: makes a Job for a schedule time that is due (only times after the CronJob
 * was made), following concurrencyPolicy, then deletes finished Jobs beyond the history limits, oldest first.
 */
export function cronTick(env: Env) {
  const now = env.now();
  for (const cron of env.store.list('CronJob')) {
    const period = periodOf(cron.schedule);
    if (!period) continue;
    const due = Math.floor(now / period) * period;
    const mine = () => env.store.list('Job').filter((j) => j.owner === cron.name);
    // First look: schedule times up to now came before the CronJob existed.
    if (cron.lastScheduled === undefined) {
      env.store.write({ op: 'update', object: { ...cron, lastScheduled: due } });
      continue;
    }
    if (due > cron.lastScheduled) {
      const name = `${cron.name}-${due / 60}`;
      const running = mine().filter((j) => !j.status.condition);
      const scheduled: CronJob = { ...cron, lastScheduled: due };
      if (running.length > 0 && cron.concurrencyPolicy === 'Forbid') {
        env.store.write({ op: 'update', object: scheduled });
        env.apply({ event: { kind: 'cron', ...by, subjects: [cron.name, name], text: `CronJob ${cron.name} skips the ${due / 60} min run: ${running.map((j) => j.name).join(', ')} is still running (Forbid)` } });
      } else {
        if (cron.concurrencyPolicy === 'Replace') for (const job of running) remove(env, job, `CronJob ${cron.name} deletes ${job.name} and its pods to make room for the ${due / 60} min run (Replace)`);
        env.store.write({ op: 'update', object: scheduled });
        const job: Job = { kind: 'Job', name, ...structuredClone(cron.jobTemplate), owner: cron.name, status: { active: 0, succeeded: 0, failed: 0 } };
        env.apply({ write: { op: 'create', object: job }, event: { kind: 'cron', ...by, subjects: [name, cron.name], text: `CronJob ${cron.name}'s ${due / 60} min run is due: it creates Job ${name}` } });
      }
    }
    // History limits: the newest successful and failed Jobs stay, older ones go with their pods.
    for (const [condition, keep] of [['Complete', cron.successfulHistory], ['Failed', cron.failedHistory]] as const) {
      const old = mine().filter((j) => j.status.condition === condition).toSorted(order);
      for (const job of old.slice(0, Math.max(0, old.length - keep))) remove(env, job, `CronJob ${cron.name} keeps ${keep} ${condition === 'Complete' ? 'successful' : 'failed'} Job${keep === 1 ? '' : 's'}, so it deletes the oldest, ${job.name}`);
    }
  }
}
