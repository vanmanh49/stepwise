import type { Env } from '../env';
import { backoffS } from '../kubelet';
import { podName } from '../names';
import type { Job, JobStatus, Pod } from '../model';

/** Per-run memory of the Job controller: when each Job may next create a pod, and which deadlines are set. */
export interface JobState {
  retryAt: Map<string, { failed: number; at: number }>;
  deadlines: Set<string>;
}

const finished = (p: Pod) => p.phase === 'Completed' || p.phase === 'Failed';
/** Failures so far: failed pods, plus in-place restarts when the restart policy is OnFailure. */
const failures = (pods: Pod[]) => pods.filter((p) => p.phase === 'Failed').length + pods.reduce((s, p) => s + (p.restartPolicy === 'OnFailure' ? p.restarts : 0), 0);
const by = { by: 'controllers' as const };

function sameStatus(a: JobStatus, b: JobStatus) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The Job controller: keeps up to parallelism pods running until completions pods have succeeded. A failure delays the
 * next pod by a back-off (10 s, doubling); more failures than backoffLimit, or running past activeDeadlineSeconds, fails the Job.
 */
export function reconcileJobs(env: Env, state: JobState) {
  const now = env.now();
  for (const job of env.store.list('Job')) {
    if (job.status.condition) continue;
    const pods = env.store.list('Pod').filter((p) => p.owner === job.name && p.ownerKind === 'Job');
    const running = pods.filter((p) => !finished(p));
    const startedAt = job.status.startedAt ?? now;
    const status: JobStatus = { active: running.length, succeeded: pods.filter((p) => p.phase === 'Completed').length, failed: failures(pods), startedAt };
    if (job.activeDeadlineS !== undefined && !state.deadlines.has(job.name)) {
      state.deadlines.add(job.name);
      env.later(startedAt + job.activeDeadlineS - now, { kind: 'job-sync' });
    }
    const end = (reason: JobStatus['reason'], why: string) => {
      for (const pod of running) env.apply({ write: { op: 'delete', object: pod }, event: { kind: 'delete-pod', ...by, node: pod.node, subjects: [pod.name, job.name], text: `Job ${job.name} has failed, so it stops ${pod.name}` } });
      env.apply({ write: { op: 'update', object: { ...job, status: { ...status, active: 0, condition: 'Failed', reason } } }, event: { kind: 'job', ...by, subjects: [job.name], text: `Job ${job.name} fails: ${reason} (${why})` } });
    };
    if (job.activeDeadlineS !== undefined && now - startedAt >= job.activeDeadlineS) {
      end('DeadlineExceeded', `it ran for ${job.activeDeadlineS} s, its activeDeadlineSeconds`);
      continue;
    }
    if (status.failed > job.backoffLimit) {
      end('BackoffLimitExceeded', `${status.failed} failures, more than its backoffLimit of ${job.backoffLimit}`);
      continue;
    }
    if (status.succeeded >= job.completions) {
      env.apply({ write: { op: 'update', object: { ...job, status: { ...status, condition: 'Complete' } } }, event: { kind: 'job', ...by, subjects: [job.name], text: `Job ${job.name} is Complete: ${status.succeeded} of ${job.completions} pods succeeded` } });
      continue;
    }
    // A new failure sets the next pod back by the back-off for that many failures.
    const retry = state.retryAt.get(job.name);
    if (status.failed > 0 && (!retry || retry.failed !== status.failed)) {
      const wait = backoffS(status.failed - 1);
      state.retryAt.set(job.name, { failed: status.failed, at: now + wait });
      env.later(wait, { kind: 'job-sync' });
    }
    const waitUntil = state.retryAt.get(job.name)?.at ?? 0;
    const wanted = Math.min(job.parallelism, job.completions - status.succeeded) - running.length;
    const created: string[] = [];
    if (now >= waitUntil) {
      const taken = new Set<string>();
      for (let i = 0; i < wanted; i++) {
        const name = podName({ now, store: env.store, rng: env.rng }, job.name, taken);
        const pod: Pod = { ...structuredClone(job.template), kind: 'Pod', name, owner: job.name, ownerKind: 'Job', phase: 'Pending', ready: false, restarts: 0, createdAt: now };
        if (env.apply({ write: { op: 'create', object: pod }, event: { kind: 'create-pod', ...by, subjects: [name, job.name], text: `Job ${job.name} has ${status.succeeded} of ${job.completions} done and ${running.length + i} running: it creates ${name}` } })) created.push(name);
      }
    } else if (wanted > 0) {
      env.apply({ event: { kind: 'job', ...by, subjects: [job.name], text: `Job ${job.name} has ${status.failed} failure${status.failed === 1 ? '' : 's'}: it waits until ${waitUntil} s before the next pod (back-off)` } });
    }
    const next = { ...status, active: running.length + created.length };
    if (!sameStatus(next, job.status)) env.store.write({ op: 'update', object: { ...job, status: next } });
  }
}

/** The pods a Job made, so whoever deletes the Job can delete them too. */
export const podsOfJob = (env: Env, job: Job) => env.store.list('Pod').filter((p) => p.owner === job.name && p.ownerKind === 'Job');
