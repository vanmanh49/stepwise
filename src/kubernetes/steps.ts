import { lineOf } from '../data-structures/shared';
import type { Step } from '../types/visualization';
import { EVICT_S, GRACE_S, MAX_STEPS, type Frame, type SimResult, type Snapshot, type TraceEvent, type TraceKind } from './model';
import { clusterView } from './view';

export interface StepOptions {
  code: string;
  /** A snippet of `code` per event kind, for lineOf; kinds left out use line 1. */
  lines: Partial<Record<TraceKind, string>>;
  /** Lesson wording for an event; return undefined to keep the defaults. */
  explain?: (event: TraceEvent, state: Snapshot) => { title?: string; why?: string; next?: string; line?: string } | undefined;
  /** The Deployment or ReplicaSet whose desired / current / ready go in variables. */
  focus?: string;
  /** Show reconciles that found nothing to do (hidden by default). */
  noops?: boolean;
}

const LOG_LINES = 4;

const WHY: Record<TraceKind, string> = {
  action: 'kubectl sends the change to the API server, which checks it and stores it in etcd. Nothing else happens until a controller notices.',
  'refuse-write': 'Every change goes through the API server into etcd. While etcd is down nothing can be saved, so nothing changes.',
  reconcile: 'A controller compares what is wanted with what exists. They already match, so it does nothing.',
  'create-pod': 'The ReplicaSet counts its pods and makes up the difference. A new pod starts Pending: no node has been chosen for it yet.',
  'delete-pod': 'A pod is removed: there are more than wanted, or its node is gone.',
  scale: 'The Deployment moves pods from the old ReplicaSet to the new one a few at a time, staying within maxSurge and maxUnavailable.',
  rollout: 'The Deployment has no ReplicaSet for its current pod template, so it creates one.',
  bind: 'The scheduler rules out nodes that can\'t take the pod, scores the rest, and binds the pod to the highest score. With nothing else set, that is the node with the most room left.',
  unschedulable: 'No node has room for the pod, so it stays Pending until one does.',
  pull: 'The kubelet on the node sees a pod bound to it and pulls the container image.',
  'pull-fail': "The image can't be pulled, so the container can't start. The kubelet keeps trying, waiting longer each time.",
  start: "The container is running, but the pod isn't ready until its readiness check passes.",
  ready: 'The pod passes its readiness check and can now receive traffic.',
  'not-ready': "A pod that isn't ready keeps running, but it should get no new traffic.",
  exit: "The container's process has ended. The pod's restart policy decides what happens next.",
  'back-off': 'Restarting a crashing container straight away wastes effort, so the kubelet waits, doubling the wait after each crash (up to 160 s here; 5 minutes by default).',
  restart: 'The wait is over, so the kubelet starts the container again.',
  'node-not-ready': `The control plane only learns that a node is gone when its heartbeats stop for longer than the grace period (${GRACE_S} s here; 40 s by default).`,
  lost: `Pods on a NotReady node can't be reached. After a short wait (${EVICT_S} s here; 5 minutes by default) they are deleted so they can be replaced.`,
  endpoints: "A Service's Endpoints list holds the ready pods its selector matches. kube-proxy only sends traffic to these.",
  route: 'kube-proxy picks one of the Service\'s endpoints at random for each new connection.',
  'request-fail': 'With no endpoints there is nowhere to send the request.',
  fault: 'Something outside Kubernetes has gone wrong. Watch how long it takes the cluster to notice.',
  'component-down': 'While a control-plane component is down, the work it does waits.',
  'component-up': 'Controllers are level-triggered: when they come back they read the current state and fix everything at once, instead of replaying what they missed.',
  filter: 'The scheduler first rules out nodes that can\'t take the pod, then scores the rest.',
  metrics: 'Every few seconds the metrics pipeline reads each pod\'s CPU and memory use (every 5 s here; about 15 s in Kubernetes).',
  throttle: 'The pod wants more CPU than its limit, so it is slowed down to the limit. CPU is shared, so going over it throttles; it never kills.',
  'oom-kill': 'Memory can\'t be taken back, so a container that uses more than its memory limit is killed (OOMKilled, exit code 137) and restarted.',
  evict: 'The pod is evicted: removed from its node so it can be replaced somewhere else.',
  'evict-refused': 'Evicting this pod would leave fewer pods ready than the PodDisruptionBudget allows, so the eviction is refused and tried again later.',
  'probe-fail': 'The kubelet\'s probe got no healthy answer. After enough failures in a row it acts.',
  'probe-ok': 'The startup probe succeeded, so the app has finished starting. Only now do the liveness and readiness probes begin.',
  hpa: 'The HPA compares the pods\' average CPU with its target and sets the Deployment\'s replicas to bring them together.',
  'node-add': 'Pods are Pending for lack of room, and a new node would fit them, so the Cluster Autoscaler adds one.',
  'node-remove': 'This node has been mostly idle for a while and its pods fit elsewhere, so the Cluster Autoscaler drains and removes it.',
  cordon: 'A cordoned node keeps its pods but gets no new ones.',
  taint: 'A taint repels pods that don\'t tolerate it.',
  summary: 'This is where the run ends.',
};

const names = (frames: Frame[]) => frames.map((f) => f.event.subjects[0]).join(', ');

/** What a merged step is about: node events by node, pod events by the pod's ReplicaSet (or the node it is on). */
function ownerOf({ event, state }: Frame): string {
  if (event.kind === 'lost' || event.kind === 'node-not-ready' || event.kind === 'evict') return event.node ?? '';
  if (event.kind === 'create-pod' || event.kind === 'delete-pod') return event.subjects[1] ?? event.node ?? '';
  return state.pods.find((p) => p.name === event.subjects[0])?.owner ?? event.node ?? '';
}

/** One title for several events of the same kind at the same second. */
function mergedTitle(frames: Frame[]): string {
  const [first] = frames as [Frame, ...Frame[]];
  const n = frames.length;
  if (n === 1) return first.event.text;
  const e = first.event;
  switch (e.kind) {
    case 'create-pod':
      return `ReplicaSet ${e.subjects[1]} creates ${n} pods: ${names(frames)}`;
    case 'bind':
      return `scheduler binds ${n} pods: ${frames.map((f) => `${f.event.subjects[0]} → ${f.event.node}`).join(', ')}`;
    case 'pull':
      return `kubelets pull the image for ${n} pods: ${names(frames)}`;
    case 'start':
      return `${n} pods are Running (not ready yet): ${names(frames)}`;
    case 'ready':
      return `${n} pods are ready: ${names(frames)}`;
    case 'lost':
      return `${n} pods on ${e.node} are Lost: ${names(frames)}`;
    case 'delete-pod':
      return `${n} pods are deleted: ${names(frames)}`;
    case 'unschedulable': {
      const reasons = new Set(frames.map((f) => f.event.reason));
      return reasons.size === 1 ? `scheduler can't place ${n} pods: ${e.reason}` : `scheduler can't place ${n} pods: ${names(frames)}`;
    }
    case 'evict':
      return `${n} pods are evicted from ${e.node}: ${names(frames)}`;
    case 'pull-fail': {
      const image = first.state.pods.find((p) => p.name === e.subjects[0])?.image ?? 'the image';
      return `kubelets can't pull ${image} for ${n} pods: ${names(frames)} (${e.reason})`;
    }
    case 'action':
      return frames.every((f) => f.event.text.startsWith('kubectl deletes pod')) ? `kubectl deletes ${n} pods: ${names(frames)}` : frames.map((f) => f.event.text).join('; ');
    default:
      return frames.map((f) => f.event.text).join('; ');
  }
}

/** Where a run ended: each workload's ready pods, then the requests. */
function summary(state: Snapshot): string {
  const parts = [
    ...state.deployments.map((d) => {
      const rs = new Set(state.replicaSets.filter((r) => r.owner === d.name).map((r) => r.name));
      return `Deployment ${d.name} has ${state.pods.filter((p) => p.ready && p.owner && rs.has(p.owner)).length} of ${d.replicas} pods ready`;
    }),
    ...state.replicaSets.filter((r) => !r.owner).map((r) => `ReplicaSet ${r.name} has ${state.pods.filter((p) => p.ready && p.owner === r.name).length} of ${r.replicas} pods ready`),
    ...state.pods.filter((p) => !p.owner).map((p) => `pod ${p.name} is ${p.phase}${p.restarts ? ` after ${p.restarts} restarts` : ''}`),
  ];
  const ok = state.requests.filter((r) => r.status === 'ok').length;
  if (state.requests.length > 0) parts.push(`${ok} requests ok, ${state.requests.length - ok} failed`);
  return parts.join('; ') || 'nothing is running';
}

/** Replays a run's frames as steps: same-second events of one kind merge, and long or cut-off runs end in a summary. */
export function traceSteps(result: SimResult, options: StepOptions): Step[] {
  const frames = result.frames.filter((f) => options.noops || f.event.kind !== 'reconcile');
  const groups: Frame[][] = [];
  for (const frame of frames) {
    const group = groups.at(-1);
    const head = group?.[0];
    const same = head && head.event.kind === frame.event.kind && head.event.by === frame.event.by && head.event.t === frame.event.t && ownerOf(head) === ownerOf(frame);
    if (same) group!.push(frame);
    else groups.push([frame]);
  }

  const line = (snippet: string | undefined) => (snippet ? lineOf(options.code, snippet) : 1);
  const variables = (state: Snapshot): Record<string, string | number> => {
    const t = { t: `${state.t} s` };
    const d = state.deployments.find((x) => x.name === options.focus);
    const rs = state.replicaSets.find((x) => x.name === options.focus);
    if (!d && !rs) return t;
    const owners = d ? new Set(state.replicaSets.filter((r) => r.owner === d.name).map((r) => r.name)) : new Set([rs!.name]);
    const pods = state.pods.filter((p) => p.owner && owners.has(p.owner));
    return { ...t, desired: (d ?? rs)!.replicas, current: pods.length, ready: pods.filter((p) => p.ready).length };
  };

  const shown = groups.slice(0, MAX_STEPS);
  const drafts = shown.map((group) => {
    const last = group.at(-1)!;
    const custom = options.explain?.(group[0]!.event, last.state);
    return { frame: last, group, title: custom?.title ?? mergedTitle(group), why: custom?.why ?? WHY[last.event.kind], next: custom?.next, codeLine: line(custom?.line ?? options.lines[last.event.kind]) };
  });
  const endState = result.final ?? result.frames.at(-1)?.state;
  if (endState && result.frames.length > 0 && (groups.length > MAX_STEPS || result.cutOff || result.ranToEnd)) {
    const state = { ...endState, t: result.endedAt };
    drafts.push({
      frame: { event: { t: result.endedAt, kind: 'summary', by: 'api-server', subjects: [], text: '' }, state },
      group: [],
      title: `After ${result.endedAt} s: ${summary(endState)}`,
      why: result.cutOff
        ? `The run stops at ${result.endedAt} s, though the cluster would keep going.`
        : result.ranToEnd
          ? `This is the cluster at ${result.endedAt} s, when the run ends.`
          : 'The run has more steps than are shown. This is how it ends.',
      next: undefined,
      codeLine: 1,
    });
  }

  const log: string[] = [];
  return drafts.map((draft, i) => {
    log.push(`t=${draft.frame.state.t} s · ${draft.title}`);
    const next = draft.next ?? drafts[i + 1]?.title;
    return {
      title: draft.title,
      why: draft.why,
      ...(next && { next }),
      codeLine: draft.codeLine,
      variables: variables(draft.frame.state),
      view: clusterView(draft.frame, log.slice(-LOG_LINES), draft.group),
    };
  });
}
