import type { Env, Timer } from './env';
import { BACKOFF_CAP_S, BACKOFF_FIRST_S, BACKOFF_RESET_S, PULL_S, READY_S, START_S, type Pod, type PodPhase } from './model';

/** The wait before retry number level + 1: 10 s, doubling, capped at 160 s. */
export function backoffS(level: number): number {
  return Math.min(BACKOFF_FIRST_S * 2 ** level, BACKOFF_CAP_S);
}

interface Work {
  gen: number;
  level: number;
  startedAt: number;
}

/** One kubelet per node, run as one: starts the pods bound to each live node and keeps them running. */
export function createKubelet(env: Env) {
  const work = new Map<string, Work>();
  const by = (pod: Pod) => ({ by: 'kubelet' as const, node: pod.node!, subjects: [pod.name] });
  const crash = (pod: Pod) => env.faults.find((f) => f.kind === 'crash' && pod.name.startsWith(f.prefix)) as Extract<Env['faults'][number], { kind: 'crash' }> | undefined;
  const badImage = (image: string) => env.faults.some((f) => f.kind === 'bad-image' && f.image === image);
  const timer = (delay: number, step: Extract<Timer, { kind: 'kubelet' }>['step'], pod: Pod, w: Work) => env.later(delay, { kind: 'kubelet', step, pod: pod.name, gen: w.gen });

  function pull(pod: Pod, w: Work) {
    env.apply({ write: { op: 'update', object: { ...pod, phase: pod.phase === 'ImagePullBackOff' ? pod.phase : 'ContainerCreating' } }, event: { kind: 'pull', ...by(pod), text: `kubelet on ${pod.node} pulls ${pod.image} for ${pod.name}` } });
    timer(PULL_S, 'pulled', pod, w);
  }

  function run(pod: Pod, w: Work, restart: boolean) {
    w.startedAt = env.now();
    const restarts = pod.restarts + (restart ? 1 : 0);
    const text = restart ? `kubelet restarts ${pod.name} (restart ${restarts})` : `${pod.name} is Running on ${pod.node} (not ready yet)`;
    env.apply({ write: { op: 'update', object: { ...pod, phase: 'Running', ready: false, restarts } }, event: { kind: restart ? 'restart' : 'start', ...by(pod), text } });
    timer(READY_S, 'ready', pod, w);
    const fault = crash(pod);
    if (fault) timer(fault.afterS, 'exit', pod, w);
  }

  function exit(pod: Pod, w: Work) {
    const fault = crash(pod)!;
    const ran = env.now() - w.startedAt;
    w.gen++; // a pending "ready" for this run no longer applies
    const again = pod.restartPolicy === 'Always' || (pod.restartPolicy === 'OnFailure' && fault.exitCode !== 0);
    const final: PodPhase = again ? 'CrashLoopBackOff' : fault.exitCode === 0 ? 'Completed' : 'Failed';
    const exited = { ...pod, phase: final, ready: false };
    env.apply({ write: { op: 'update', object: exited }, event: { kind: 'exit', ...by(pod), text: `${pod.name}'s container exits with code ${fault.exitCode} after ${ran} s${again ? '' : `: ${final}`}` } });
    if (!again) return;
    if (ran >= BACKOFF_RESET_S) w.level = 0;
    const wait = backoffS(w.level++);
    env.apply({ event: { kind: 'back-off', ...by(pod), text: `kubelet waits ${wait} s before restarting ${pod.name} (CrashLoopBackOff)` } });
    timer(wait, 'restart', pod, w);
  }

  return {
    /** Picks up pods newly bound to a live node and forgets deleted ones. */
    reconcile() {
      const pods = env.store.list('Pod');
      const names = new Set(pods.map((p) => p.name));
      for (const name of work.keys()) if (!names.has(name)) work.delete(name);
      for (const pod of pods) {
        if (!pod.node || work.has(pod.name) || env.offline.has(pod.node) || pod.phase !== 'Pending') continue;
        const w = { gen: 0, level: 0, startedAt: 0 };
        work.set(pod.name, w);
        pull(pod, w);
      }
    },
    fire(t: Extract<Timer, { kind: 'kubelet' }>) {
      const w = work.get(t.pod);
      const pod = env.store.get('Pod', t.pod);
      if (!w || !pod || w.gen !== t.gen || env.offline.has(pod.node!)) return;
      switch (t.step) {
        case 'pull':
          return pull(pod, w);
        case 'pulled':
          if (!badImage(pod.image)) return timer(START_S, 'started', pod, w);
          {
            const wait = backoffS(w.level++);
            env.apply({
              write: { op: 'update', object: { ...pod, phase: 'ImagePullBackOff', reason: 'ErrImagePull' } },
              event: { kind: 'pull-fail', ...by(pod), text: `kubelet on ${pod.node} can't pull ${pod.image} for ${pod.name} (ErrImagePull); it tries again in ${wait} s`, reason: 'ErrImagePull' },
            });
            return timer(wait, 'pull', pod, w);
          }
        case 'started':
          return run(pod, w, false);
        case 'restart':
          return run(pod, w, true);
        case 'ready':
          env.apply({ write: { op: 'update', object: { ...pod, ready: true } }, event: { kind: 'ready', ...by(pod), text: `${pod.name} is ready` } });
          return;
        case 'exit':
          return exit(pod, w);
      }
    },
  };
}
