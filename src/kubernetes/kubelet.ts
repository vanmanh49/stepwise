import type { Env, Timer } from './env';
import { BACKOFF_CAP_S, BACKOFF_FIRST_S, BACKOFF_RESET_S, PULL_S, READY_S, START_S, type Pod, type PodPhase, type TraceKind } from './model';

/** The wait before retry number level + 1: 10 s, doubling, capped at 160 s. */
export function backoffS(level: number): number {
  return Math.min(BACKOFF_FIRST_S * 2 ** level, BACKOFF_CAP_S);
}

/** How a container stopped; a kill names its cause and narration, a crash fault needs only the code. */
export interface Termination {
  code: number;
  cause?: 'OOMKilled' | 'Liveness';
  kind?: TraceKind;
  text?: string;
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

  /** A write etcd refused is tried again a second later, so the pod never moves on from a state that wasn't saved. */
  const RETRY_S = 1;

  function pull(pod: Pod, w: Work) {
    const ok = env.apply({ write: { op: 'update', object: { ...pod, phase: pod.phase === 'ImagePullBackOff' ? pod.phase : 'ContainerCreating' } }, event: { kind: 'pull', ...by(pod), text: `kubelet on ${pod.node} pulls ${pod.image} for ${pod.name}` } });
    timer(ok ? PULL_S : RETRY_S, ok ? 'pulled' : 'pull', pod, w);
  }

  function run(pod: Pod, w: Work, restart: boolean) {
    w.startedAt = env.now();
    const restarts = pod.restarts + (restart ? 1 : 0);
    const text = restart ? `kubelet restarts ${pod.name} (restart ${restarts})` : `${pod.name} is Running on ${pod.node} (not ready yet)`;
    if (!env.apply({ write: { op: 'update', object: { ...pod, phase: 'Running', ready: false, restarts } }, event: { kind: restart ? 'restart' : 'start', ...by(pod), text } })) {
      return timer(RETRY_S, restart ? 'restart' : 'started', pod, w);
    }
    timer(READY_S, 'ready', pod, w);
    const fault = crash(pod);
    if (fault) timer(fault.afterS, 'exit', pod, w);
  }

  /** The container stops: on its own (a crash fault), or killed for using too much memory or failing its liveness probe. */
  function exit(pod: Pod, w: Work, end: Termination = { code: crash(pod)!.exitCode }) {
    const ran = env.now() - w.startedAt;
    const again = pod.restartPolicy === 'Always' || (pod.restartPolicy === 'OnFailure' && end.code !== 0);
    const final: PodPhase = again ? 'CrashLoopBackOff' : end.code === 0 ? 'Completed' : 'Failed';
    const exited: Pod = { ...pod, phase: final, ready: false, ...(end.cause && { lastTermination: end.cause }) };
    const text = end.text ?? `${pod.name}'s container exits with code ${end.code} after ${ran} s`;
    if (!env.apply({ write: { op: 'update', object: exited }, event: { kind: end.kind ?? 'exit', ...by(pod), text: `${text}${again ? '' : `: ${final}`}` } })) {
      return end.cause ? undefined : timer(RETRY_S, 'exit', pod, w);
    }
    w.gen++; // a pending "ready" for this run no longer applies
    if (!again) return;
    if (ran >= BACKOFF_RESET_S) w.level = 0;
    const wait = backoffS(w.level++);
    env.apply({ event: { kind: 'back-off', ...by(pod), text: `kubelet waits ${wait} s before restarting ${pod.name} (CrashLoopBackOff)` } });
    timer(wait, 'restart', pod, w);
  }

  return {
    /** When the pod's current container started, if the kubelet is running it. */
    startedAt: (name: string) => work.get(name)?.startedAt,
    /** Kills a running container (OOMKilled, a failed liveness probe); its restart policy decides what follows. */
    kill(name: string, end: Termination) {
      const w = work.get(name);
      const pod = env.store.get('Pod', name);
      if (w && pod && pod.phase === 'Running') exit(pod, w, end);
    },
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
            const wait = backoffS(w.level);
            const saved = env.apply({
              write: { op: 'update', object: { ...pod, phase: 'ImagePullBackOff', reason: 'ErrImagePull' } },
              event: { kind: 'pull-fail', ...by(pod), text: `kubelet on ${pod.node} can't pull ${pod.image} for ${pod.name} (ErrImagePull); it tries again in ${wait} s`, reason: 'ErrImagePull' },
            });
            if (!saved) return timer(RETRY_S, 'pulled', pod, w);
            w.level++;
            return timer(wait, 'pull', pod, w);
          }
        case 'started':
          return run(pod, w, false);
        case 'restart':
          return run(pod, w, true);
        case 'ready':
          if (!env.apply({ write: { op: 'update', object: { ...pod, ready: true } }, event: { kind: 'ready', ...by(pod), text: `${pod.name} is ready` } })) timer(RETRY_S, 'ready', pod, w);
          return;
        case 'exit':
          return exit(pod, w);
      }
    },
  };
}
