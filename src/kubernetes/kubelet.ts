import type { Env, Timer } from './env';
import { resolveConfig } from './config';
import { attachFor, claimsOf } from './controllers/volumes';
import { answers, PROBE_NAME, type ProbeKind } from './probes';
import { ATTACH_RETRY_S, ATTACH_S, CONFIG_SYNC_S, BACKOFF_CAP_S, BACKOFF_FIRST_S, BACKOFF_RESET_S, PULL_S, READY_S, START_S, type Pod, type PodPhase, type TraceKind } from './model';

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
  /** Failures in a row per probe, and whether the startup probe has succeeded, for the current container. */
  failures: Record<ProbeKind, number>;
  started: boolean;
}

const freshProbes = () => ({ failures: { startup: 0, liveness: 0, readiness: 0 }, started: false });

/** One kubelet per node, run as one: starts the pods bound to each live node and keeps them running. */
export function createKubelet(env: Env) {
  const work = new Map<string, Work>();
  /** Failed runs per owner, for workloads that fail their first few times. */
  const ownerFailures = new Map<string, number>();
  const by = (pod: Pod) => ({ by: 'kubelet' as const, node: pod.node!, subjects: [pod.name] });
  const crash = (pod: Pod) => env.faults.find((f) => f.kind === 'crash' && pod.name.startsWith(f.prefix)) as Extract<Env['faults'][number], { kind: 'crash' }> | undefined;
  const badImage = (image: string) => env.faults.some((f) => f.kind === 'bad-image' && f.image === image);
  const timer = (delay: number, step: Extract<Timer, { kind: 'kubelet' }>['step'], pod: Pod, w: Work) => env.later(delay, { kind: 'kubelet', step, pod: pod.name, gen: w.gen });
  const probeTimer = (delay: number, kind: ProbeKind, pod: Pod, w: Work) => env.later(delay, { kind: 'kubelet', step: 'probe', probe: kind, pod: pod.name, gen: w.gen });

  /** Liveness and readiness start once the container runs, or once the startup probe succeeds. */
  function startProbes(pod: Pod, w: Work, kinds: ProbeKind[]) {
    for (const kind of kinds) {
      const p = pod.probes?.[kind];
      if (p) probeTimer((p.initialDelayS ?? 0) + p.periodS, kind, pod, w);
    }
  }

  function probe(pod: Pod, w: Work, kind: ProbeKind) {
    const spec = pod.probes![kind]!;
    const ok = pod.phase === 'Running' && answers(env.faults, pod.name, w.startedAt, env.now());
    const name = PROBE_NAME[kind];
    if (ok) {
      w.failures[kind] = 0;
      if (kind === 'startup') {
        w.started = true;
        env.apply({ event: { kind: 'probe-ok', ...by(pod), text: `${pod.name} passes its startup probe: liveness and readiness probes start` } });
        startProbes(pod, w, ['liveness', 'readiness']);
        if (!pod.probes?.readiness) env.apply({ write: { op: 'update', object: { ...pod, ready: true } }, event: { kind: 'ready', ...by(pod), text: `${pod.name} is ready` } });
        return;
      }
      if (kind === 'readiness' && !pod.ready) env.apply({ write: { op: 'update', object: { ...pod, ready: true } }, event: { kind: 'ready', ...by(pod), text: `${pod.name} passes its readiness probe: ready` } });
      return probeTimer(spec.periodS, kind, pod, w);
    }
    const n = ++w.failures[kind];
    const limit = spec.failureThreshold;
    if (kind === 'readiness') {
      // Only a ready pod's failures matter to traffic; a pod that never got ready fails quietly.
      if (pod.ready) {
        env.apply(
          n >= limit
            ? { write: { op: 'update', object: { ...pod, ready: false } }, event: { kind: 'not-ready', ...by(pod), text: `${pod.name} failed its readiness probe ${limit} times: not ready` } }
            : { event: { kind: 'probe-fail', ...by(pod), text: `Readiness probe failed for ${pod.name} (${n}/${limit})` } },
        );
      }
      return probeTimer(spec.periodS, kind, pod, w);
    }
    env.apply({ event: { kind: 'probe-fail', ...by(pod), text: `${name} probe failed for ${pod.name} (${n}/${limit})` } });
    if (n < limit) return probeTimer(spec.periodS, kind, pod, w);
    exit(pod, w, { code: 137, cause: 'Liveness', text: `${name} probe failed ${limit} times: kubelet restarts ${pod.name}` });
  }

  /** A write etcd refused is tried again a second later, so the pod never moves on from a state that wasn't saved. */
  const RETRY_S = 1;

  /** Volumes first: a pod with claims waits until each of its volumes can be attached to its node. */
  function attach(pod: Pod, w: Work) {
    if (claimsOf(pod).length === 0) return pull(pod, w);
    const check = attachFor(env.store, pod);
    if (!check.ok) {
      // Told once; the kubelet keeps retrying quietly.
      if (pod.reason !== check.reason) {
        env.apply({ write: { op: 'update', object: { ...pod, phase: 'ContainerCreating', reason: check.reason } }, event: { kind: 'attach-fail', ...by(pod), text: `kubelet on ${pod.node} can't start ${pod.name}: ${check.reason}`, reason: check.reason } });
      }
      return timer(ATTACH_RETRY_S, 'attach', pod, w);
    }
    const needed = check.volumes.filter((v) => v.attachedTo !== pod.node);
    if (needed.length === 0) return pull(pod, w);
    for (const v of needed) {
      env.apply({ write: { op: 'update', object: { ...v, attachedTo: pod.node! } }, event: { kind: 'attach', ...by(pod), subjects: [pod.name, v.name], text: `${v.name} is attached to ${pod.node} for ${pod.name}` } });
    }
    timer(ATTACH_S, 'pull', pod, w);
  }

  function pull(pod: Pod, w: Work) {
    if (pod.reason?.startsWith('Multi-Attach')) {
      const { reason: _reason, ...rest } = pod;
      pod = rest;
    }
    const ok = env.apply({ write: { op: 'update', object: { ...pod, phase: pod.phase === 'ImagePullBackOff' ? pod.phase : 'ContainerCreating' } }, event: { kind: 'pull', ...by(pod), text: `kubelet on ${pod.node} pulls ${pod.image} for ${pod.name}` } });
    timer(ok ? PULL_S : RETRY_S, ok ? 'pulled' : 'pull', pod, w);
  }

  function run(pod: Pod, w: Work, restart: boolean) {
    const resolved = resolveConfig(env.store, pod);
    if (!resolved.ok) {
      // Env from a missing ConfigMap or Secret is a config error; a missing mounted ConfigMap keeps the pod ContainerCreating.
      const phase = resolved.mount ? 'ContainerCreating' : 'CreateContainerConfigError';
      const event = { kind: 'config-error' as const, ...by(pod), text: `kubelet can't start ${pod.name}: ${resolved.reason}`, reason: resolved.reason };
      // Told once: retries in the same state say nothing new.
      if (pod.phase !== phase || pod.reason !== resolved.reason) env.apply({ write: { op: 'update', object: { ...pod, phase, reason: resolved.reason } }, event });
      return timer(CONFIG_SYNC_S, restart ? 'restart' : 'started', pod, w);
    }
    const { reason: _reason, ...rest } = pod;
    const config = { ...resolved.env, ...resolved.mounted };
    pod = { ...rest, ...(Object.keys(config).length > 0 && { config }) };
    w.startedAt = env.now();
    Object.assign(w, freshProbes());
    const restarts = pod.restarts + (restart ? 1 : 0);
    const text = restart ? `kubelet restarts ${pod.name} (restart ${restarts})` : `${pod.name} is Running on ${pod.node} (not ready yet)`;
    if (!env.apply({ write: { op: 'update', object: { ...pod, phase: 'Running', ready: false, restarts } }, event: { kind: restart ? 'restart' : 'start', ...by(pod), text } })) {
      return timer(RETRY_S, restart ? 'restart' : 'started', pod, w);
    }
    if (pod.probes?.startup) startProbes(pod, w, ['startup']);
    else startProbes(pod, w, ['liveness', 'readiness']);
    // With no probe deciding readiness, the pod is ready shortly after it starts, as in phase 1.
    if (!pod.probes?.readiness && !pod.probes?.startup) timer(READY_S, 'ready', pod, w);
    const fault = crash(pod);
    if (fault) timer(fault.afterS, 'exit', pod, w);
    else if (pod.run) timer(pod.run.seconds, 'exit', pod, w);
  }

  /** The container stops: on its own (a crash fault), or killed for using too much memory or failing its liveness probe. */
  /** How a container that exits on its own ends: a crash fault's code, or a finishing workload's (failing its owner's first failFirst runs). */
  function endOf(pod: Pod): Termination {
    if (!pod.run || crash(pod)) return { code: crash(pod)!.exitCode };
    const key = pod.owner ?? pod.name;
    const failed = ownerFailures.get(key) ?? 0;
    const code = failed < (pod.run.failFirst ?? 0) ? 1 : pod.run.exitCode;
    if (code !== 0) ownerFailures.set(key, failed + 1);
    return { code };
  }

  function exit(pod: Pod, w: Work, end: Termination = endOf(pod)) {
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
    /** Whether the pod's app answers requests now (not starting slowly, not hung). */
    answers: (name: string) => {
      const w = work.get(name);
      return !w || answers(env.faults, name, w.startedAt, env.now());
    },
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
        const w = { gen: 0, level: 0, startedAt: 0, ...freshProbes() };
        work.set(pod.name, w);
        attach(pod, w);
      }
    },
    fire(t: Extract<Timer, { kind: 'kubelet' }>) {
      const w = work.get(t.pod);
      const pod = env.store.get('Pod', t.pod);
      if (!w || !pod || w.gen !== t.gen || env.offline.has(pod.node!)) return;
      switch (t.step) {
        case 'attach':
          return attach(pod, w);
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
        case 'probe':
          return probe(pod, w, t.probe!);
      }
    },
  };
}
