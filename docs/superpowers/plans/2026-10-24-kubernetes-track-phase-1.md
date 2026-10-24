# Kubernetes Track, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth category, Kubernetes, with a seeded reconciliation simulator, a `cluster` view, and the 7 Foundations lessons live (16 more topics as Coming soon).

**Architecture:** `src/kubernetes/` (no React) holds the model, an API-server object store, level-triggered controllers (pure functions over the store), a simulator (`simulate(scenario) → { frames }`, each frame an event plus a snapshot of the cluster after it), and `traceSteps`, which turns frames into `Step[]` with a `ClusterView` each. Each lesson is a scenario module (`fooCode`, `fooScenario`, `fooSteps`) driven by the existing `form` input. `ClusterRenderer` is plain HTML/CSS.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite, Vitest, Tailwind, lucide-react, Oxlint.

**Spec:** `docs/superpowers/specs/2026-10-24-kubernetes-track-phase-1-design.md`

## Global Constraints

- Branch `kubernetes-phase-1` in the `stepwise` folder (already created; the spec is committed). No worktrees.
- `src/kubernetes/` contains no React. All lesson text lives in `src/lessons/`.
- Engine entry points never throw on user input; unusable form values return one step through `refusal(title, why, view)` (`src/algorithms/form.ts`), read with `readInt` / `readChoice`.
- Simulated **seconds**. `MAX_TIME = 600`; `MAX_STEPS = 200` steps plus at most one summary step.
- Deterministic: events ordered by `(time, sequence)` (`EventQueue`); the only randomness is `seeded(SEED)` with `SEED = 7`.
- Timings (shortened, and each lesson's text says so): watch latency 1 s, pull 2 s, start 1 s, ready 2 s after start, heartbeat every 10 s, node check every 5 s, node grace 20 s (Kubernetes: 40 s), eviction 10 s after NotReady (Kubernetes: 5 min), back-off 10 → 20 → 40 → 80 → 160 s cap, reset after 60 s running.
- Limits: 1–4 nodes, 1–6 replicas (per lesson ranges below), `maxSurge` / `maxUnavailable` not both 0.
- Code lines via `lineOf(code, snippet)` (`src/data-structures/shared.ts`), never hard-coded.
- Kubernetes lessons have no `complexity`. Quizzes have 4–5 questions, at least 3 types (`multiple-choice`, `code`, `predict-next`), at least one with a `view`. `codeLabel: 'Pseudocode'`.
- Copy: plain, short sentences for beginners, explaining what happened and why with the run's actual values. Kubernetes terms used as-is and explained once.
- Colours come only from CSS variables; roles only from `roles.ts`. Repeated UI becomes a component; component files export only components.
- Commit messages, PR titles and PR bodies contain no AI attribution (no `Co-Authored-By` trailer for an AI, no "Generated with" line).
- Every task ends green on `npm run typecheck`, `npm run lint` and `npm test`.

## Review Focus

- **Garbage in number fields** (blank, `abc`, `-3`, `1e9`): one refusal step, never a throw or an empty run. Pinned in Task 8's contract test.
- **Two events at the same second** (a node goes down exactly when the scheduler binds to it): faults at time t apply before anything else at t, so the scheduler sees the node NotReady only after the grace period, and the pod is bound, then Lost, then replaced. Pinned in Task 5 (`faults first`) and Task 12 (node-2 goes down at 20 s, the same second as its heartbeat, so the heartbeat never happens).
- **A crash loop that never ends** (restartPolicy Always, crash after 5 s): the run stops at `until`/`MAX_TIME`, ends with a summary step, and stays within `MAX_STEPS + 1`. Pinned in Task 5 and the contract test.
- **Phone width (375 px)**: four node boxes with six pods wrap into rows; nothing scrolls sideways. Checked by hand in Task 14 (renderers have no DOM tests).
- **Re-running the same values** gives identical steps, including pod names and kube-proxy picks. Pinned in Task 8's contract test.

---

## File map

| File | Responsibility |
|---|---|
| `src/utils/random.ts` | `seeded(seed)` mulberry32, moved from `src/microservices/sim.ts` |
| `src/utils/eventQueue.ts` | `EventQueue<T>`, moved from `src/microservices/queue.ts` |
| `src/kubernetes/model.ts` | object, action, fault, trace, snapshot types; timing constants; `MAX_TIME`, `MAX_STEPS` |
| `src/kubernetes/selector.ts` | `matches`, `explainMatch`, `formatSelector` |
| `src/kubernetes/store.ts` | `Store`: versioned objects, writes, refusals, snapshots |
| `src/kubernetes/controllers/{replicaset,deployment,scheduler,endpoints}.ts` | pure reconcilers `(ctx) → Change[]` |
| `src/kubernetes/kubelet.ts` | per-run kubelet: pull, start, ready, exit, restart, back-off |
| `src/kubernetes/nodes.ts` | heartbeats and node lifecycle (NotReady, Lost, eviction) |
| `src/kubernetes/sim.ts` | `simulate`: event loop, actions, faults, component outages, watch fan-out, kube-proxy |
| `src/kubernetes/view.ts` | `clusterView(frame, log)`, `emptyClusterView()`, pod-phase roles |
| `src/kubernetes/steps.ts` | `traceSteps`: frames → `Step[]`, merging, summary |
| `src/kubernetes/scenarios/shared.ts` | scenario builders and `scenarioSteps` |
| `src/kubernetes/scenarios/<id>.ts` | one module per lesson |
| `src/kubernetes/contract.test.ts` | contract over every Kubernetes lesson |
| `src/types/visualization.ts` | `ClusterView` in the `View` union |
| `src/components/visualization/roles.ts` | `cluster` case in `rolesInView` |
| `src/components/visualization/renderers/ClusterRenderer.tsx` | control plane, node boxes, pending tray, objects table, requests, log |
| `src/lessons/meta/kubernetes.ts` | lesson metadata in learning order |
| `src/lessons/kubernetes/<id>.ts` | lesson content |

The spec's `clusterLayout.ts` is dropped: node boxes sit in a CSS grid (`repeat(auto-fill, minmax(10rem, 1fr))`), which wraps by width with no measuring code.

Other deliberate departures from the spec, all simplifications: deletes are immediate, so there is no `Terminating` phase; heartbeats aren't traced (only a missing one matters, and that shows as `node-not-ready`); the trace has no separate `write` / `watch` events, because each controller change is its own event; and `refusal` (`src/algorithms/form.ts`, as Microservices uses) replaces `refuse`.

---

### Task 1: Category wiring and curriculum

**Files:**
- Modify: `src/types/lesson.ts` (`Category`), `src/lessons/labels.ts`, `src/lessons/curriculum.ts`, `src/lessons/registry.ts`, `src/lessons/all.testutil.ts`, `src/lessons/split.test.ts`, `src/lessons/lessons.test.ts`, `src/App.tsx`, `src/components/layout/Header.tsx`, `src/pages/Catalog.tsx`, `src/pages/Home.tsx`, `src/pages/Dashboard.tsx`, `src/pages/LessonPage.tsx`, `src/components/navigation/SearchPalette.tsx`
- Create: `src/lessons/meta/kubernetes.ts`

**Interfaces:**
- Produces: `Category` includes `'kubernetes'`; `kubernetesMeta: LessonMeta[]` (empty for now, appended last in `lessons`).

- [ ] **Step 1: Write failing tests**

In `lessons.test.ts`:

```ts
it('lists the Kubernetes course in order', () => {
  expect(topicsIn('kubernetes').map((t) => t.id)).toEqual([
    'cluster-architecture', 'pods', 'labels-selectors', 'desired-state-controllers', 'replicasets',
    'deployments-rolling-updates', 'services-kube-proxy',
    'scheduler', 'requests-limits', 'probes', 'taints-tolerations', 'affinity', 'hpa', 'cluster-autoscaler', 'draining-pdb',
    'configmaps-secrets', 'volumes-pv-pvc', 'statefulsets', 'daemonsets', 'jobs-cronjobs', 'ingress', 'network-policies', 'operators-crds',
  ]);
  expect(topicsIn('kubernetes').map((t) => t.group)).toEqual([
    ...Array(7).fill('Foundations'), ...Array(8).fill('Scheduling & Health'), ...Array(8).fill('Workloads & Operations'),
  ]);
});
```

In the registry test add `expect(lessonsIn('kubernetes')).toHaveLength(0)` (later tasks raise it). In `split.test.ts` add `'kubernetes'` to the category loop and `'kubernetes.ts'` to the expected meta files.

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/lessons`
Expected: FAIL (`kubernetes` is not a category).

- [ ] **Step 3: Implement**

- `Category` gains `'kubernetes'`; `CATEGORY_TITLE.kubernetes = 'Kubernetes'`.
- `curriculum.ts`: three `topics('kubernetes', …)` blocks after Microservices, titles from the spec's Curriculum table.
- Add `kubernetes` to the `import.meta.glob` brace lists in `registry.ts`, `all.testutil.ts`, `split.test.ts`.
- `lessons.test.ts` "has complete content": also skip complexity for `kubernetes`.
- `App.tsx`: routes `kubernetes` and `kubernetes/:lessonId`, as for Microservices.
- `Header.tsx`: `{ to: '/kubernetes', label: 'Kubernetes' }` after Microservices.
- `Catalog` `INTRO.kubernetes`: "How Kubernetes keeps your apps running: you declare what you want, and controllers keep working until the cluster matches. Each lesson runs a simulated cluster on your settings, one change at a time."
- `Home.tsx`: a `ProgressBar` labelled "Kubernetes". `Dashboard.tsx`: add `'kubernetes'` to the track list.
- `SearchPalette.tsx`: icon `Container` (lucide) for `kubernetes`.
- `LessonPage.tsx` `CODE_COPY.kubernetes`: title and label "Pseudocode", intro "The decisions the simulated cluster makes, as short pseudocode. In the visualization above, the highlighted line follows the component that is acting."

- [ ] **Step 4: Run the checks**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Add the Kubernetes category and its curriculum"
```

---

### Task 2: Shared utils, model, selectors and the store

**Files:**
- Move: `src/microservices/sim.ts` `seeded` → `src/utils/random.ts`; `src/microservices/queue.ts` → `src/utils/eventQueue.ts` (update every import; `git mv` the queue and its test if one exists)
- Create: `src/kubernetes/model.ts`, `src/kubernetes/selector.ts`, `src/kubernetes/store.ts`
- Test: `src/kubernetes/selector.test.ts`, `src/kubernetes/store.test.ts`

**Interfaces:**
- Produces (`model.ts`):

```ts
export const MAX_TIME = 600, MAX_STEPS = 200, SEED = 7;
export const WATCH_S = 1, PULL_S = 2, START_S = 1, READY_S = 2;
export const HEARTBEAT_S = 10, NODE_CHECK_S = 5, GRACE_S = 20, EVICT_S = 10;
export const BACKOFF_FIRST_S = 10, BACKOFF_CAP_S = 160, BACKOFF_RESET_S = 60;

export type Component = 'kubectl' | 'api-server' | 'etcd' | 'scheduler' | 'controllers' | 'kubelet' | 'kube-proxy';
export type Labels = Record<string, string>;
export type Requirement = { key: string; op: '=' | '!=' | 'in' | 'notin' | 'exists'; values: string[] };
export type Selector = Requirement[];
export type Amount = number | `${number}%`;
export interface Template { labels: Labels; image: string; cpu: number; restartPolicy: 'Always' | 'OnFailure' | 'Never' }
export type PodPhase = 'Pending' | 'ContainerCreating' | 'Running' | 'CrashLoopBackOff' | 'ImagePullBackOff' | 'Completed' | 'Failed' | 'Lost';
export interface NodeObj { kind: 'Node'; name: string; cpu: number; ready: boolean; lastHeartbeat: number }
export interface Pod { kind: 'Pod'; name: string; labels: Labels; owner?: string; node?: string; phase: PodPhase; ready: boolean;
  restarts: number; image: string; cpu: number; restartPolicy: Template['restartPolicy']; createdAt: number; reason?: string }
export interface ReplicaSet { kind: 'ReplicaSet'; name: string; replicas: number; selector: Selector; template: Template; owner?: string; revision: number }
export interface Deployment { kind: 'Deployment'; name: string; replicas: number; selector: Selector; template: Template;
  maxSurge: Amount; maxUnavailable: Amount; revision: number; /** Earlier templates, newest last. */ history: Template[] }
export interface Service { kind: 'Service'; name: string; selector: Selector }
export interface Endpoints { kind: 'Endpoints'; name: string; pods: string[] }
export type Obj = NodeObj | Pod | ReplicaSet | Deployment | Service | Endpoints;
export type Kind = Obj['kind'];
export type ObjOf<K extends Kind> = Extract<Obj, { kind: K }>;

export type Action = { at: number } & (
  | { kind: 'apply'; object: Pod | ReplicaSet | Deployment | Service }
  | { kind: 'scale'; target: string; replicas: number }          // a Deployment, else the ReplicaSet of that name
  | { kind: 'set-image'; target: string; image: string }         // a Deployment
  | { kind: 'delete-pods'; owner: string; count: number }        // the first `count` pods owned by `owner`, in name order
  | { kind: 'rollback'; target: string }                         // a Deployment
  | { kind: 'request'; id: string; service: string });
export type Fault =
  | { kind: 'node-down'; node: string; at: number }
  | { kind: 'crash'; prefix: string; afterS: number; exitCode: 0 | 1 }   // every container of a pod whose name starts with prefix exits afterS after each start
  | { kind: 'bad-image'; image: string }
  | { kind: 'not-ready'; prefix: string; at: number }                   // the first Running pod (name order) whose name starts with prefix
  | { kind: 'down'; component: 'scheduler' | 'controllers' | 'etcd'; from: number; to: number };
export interface Scenario { nodes: { name: string; cpu: number }[]; actions: Action[]; faults: Fault[]; /** Defaults to MAX_TIME. */ until?: number }

export type TraceKind = 'action' | 'refuse-write' | 'reconcile' | 'create-pod' | 'delete-pod' | 'scale' | 'rollout' | 'bind' | 'unschedulable'
  | 'pull' | 'pull-fail' | 'start' | 'ready' | 'not-ready' | 'exit' | 'restart' | 'back-off' | 'node-not-ready' | 'lost'
  | 'endpoints' | 'route' | 'request-fail' | 'fault' | 'component-down' | 'component-up' | 'summary';
export interface TraceEvent { t: number; kind: TraceKind; by: Component; node?: string; /** Object names this event touched. */ subjects: string[];
  /** Default narration with real values, e.g. "ReplicaSet web-7f creates web-7f-m4p". */ text: string; reason?: string }
export interface RequestState { id: string; service: string; status: 'pending' | 'ok' | 'failed'; pod?: string; reason?: string }
export interface Snapshot { t: number; nodes: NodeObj[]; pods: Pod[]; replicaSets: ReplicaSet[]; deployments: Deployment[];
  services: Service[]; endpoints: Endpoints[]; down: Component[]; requests: RequestState[] }
export interface Frame { event: TraceEvent; state: Snapshot }
export interface SimResult { frames: Frame[]; endedAt: number; /** True when until/MAX_TIME cut off work still scheduled. */ cutOff: boolean }
export function resolveAmount(amount: Amount, replicas: number, round: 'up' | 'down'): number;
```

- Produces (`selector.ts`): `matches(selector: Selector, labels: Labels): boolean`; `explainMatch(selector, labels): { ok: boolean; requirement: string }` (`requirement` is the first failing requirement, or the last one when all pass, formatted); `formatSelector(selector): string` (`app=web, tier in (fe,be), env!=prod, track`).
- Produces (`store.ts`):

```ts
export type Write = { op: 'create' | 'update' | 'delete'; object: Obj };
export type WriteResult = { ok: true; version: number } | { ok: false; reason: string };
export class Store {
  version: number;          // starts at 0, +1 per accepted write
  etcdUp: boolean;          // set by the simulator
  get<K extends Kind>(kind: K, name: string): ObjOf<K> | undefined;
  list<K extends Kind>(kind: K): ObjOf<K>[];      // name order
  write(w: Write): WriteResult;                   // stores a structuredClone, so callers can't change stored objects
  snapshot(): Omit<Snapshot, 't' | 'down' | 'requests'>;
}
```

- [ ] **Step 1: Write failing tests**

`selector.test.ts`:

```ts
const pod = { app: 'web', tier: 'fe', env: 'prod' };
it('matches each operator', () => {
  expect(matches([{ key: 'app', op: '=', values: ['web'] }], pod)).toBe(true);
  expect(matches([{ key: 'env', op: '!=', values: ['prod'] }], pod)).toBe(false);
  expect(matches([{ key: 'tier', op: 'in', values: ['fe', 'be'] }], pod)).toBe(true);
  expect(matches([{ key: 'tier', op: 'notin', values: ['fe'] }], pod)).toBe(false);
  expect(matches([{ key: 'track', op: 'exists', values: [] }], pod)).toBe(false);
  expect(matches([{ key: 'track', op: '!=', values: ['x'] }], pod)).toBe(true); // a missing key is "not equal"
});
it('names the requirement that decided', () => {
  expect(explainMatch([{ key: 'app', op: '=', values: ['web'] }, { key: 'env', op: '!=', values: ['prod'] }], pod))
    .toEqual({ ok: false, requirement: 'env!=prod' });
});
it('formats selectors', () => {
  expect(formatSelector([{ key: 'tier', op: 'in', values: ['fe', 'be'] }, { key: 'track', op: 'exists', values: [] }])).toBe('tier in (fe,be), track');
});
```

`store.test.ts`:
- `bumps the version once per accepted write`: create a Pod → `{ ok: true, version: 1 }`; update it → 2; `store.version === 2`.
- `refuses every write while etcd is down`: `etcdUp = false` → `{ ok: false, reason: "etcd is down, so the API server can't store anything" }`, version unchanged, `list('Pod')` unchanged.
- `refuses duplicates and missing objects`: create twice → `reason: 'Pod web-abc already exists'`; delete missing → `'Pod nope not found'`.
- `refuses a Deployment whose maxSurge and maxUnavailable are both 0`: `reason: "maxSurge and maxUnavailable can't both be 0: the rollout could never start"`.
- `keeps stored objects apart from the caller's`: mutate the object passed to `write` → `get` returns the original values.
- `resolveAmount`: `('25%', 4, 'up') === 1`, `('25%', 2, 'up') === 1`, `('25%', 2, 'down') === 0`, `(1, 9, 'down') === 1`.

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/kubernetes`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement** the three modules and move `seeded` / `EventQueue` to `src/utils/` (microservices imports updated, behaviour unchanged).

- [ ] **Step 4: Run the checks**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass, microservices tests included.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Kubernetes engine: model, selectors and the API server store"
```

---

### Task 3: ReplicaSet, scheduler and Endpoints controllers

**Files:**
- Create: `src/kubernetes/controllers/types.ts`, `controllers/replicaset.ts`, `controllers/scheduler.ts`, `controllers/endpoints.ts`, `src/kubernetes/names.ts`
- Test: `src/kubernetes/controllers/controllers.test.ts`

**Interfaces:**
- Consumes: `Store`, model types, `matches`.
- Produces:

```ts
// controllers/types.ts
export interface Ctx { now: number; store: Store; rng: () => number }
/** A write with its narration; a change without a write is a note (a reconcile that found nothing to do). */
export interface Change { write?: Write; event: Omit<TraceEvent, 't'> }
export type Reconcile = (ctx: Ctx) => Change[];
// names.ts — Kubernetes-style suffixes from the seeded rng, never colliding with a name already in the store
export function podName(ctx: Ctx, owner: string): string;          // `${owner}-` + 3 chars of 'bcdfghjklmnpqrstvwxz2456789'
export function replicaSetName(ctx: Ctx, deployment: string): string; // `${deployment}-` + 2 chars
export const reconcileReplicaSets: Reconcile;
export const schedule: Reconcile;
export const reconcileEndpoints: Reconcile;
```

Rules (from the spec):
- **ReplicaSet**: for each RS (name order), its pods are those with `owner === rs.name`. Shortfall → create pods from the template (`phase: 'Pending'`, `ready: false`, `restarts: 0`, `createdAt: now`), event `create-pod`, text "ReplicaSet web-7f sees 2 of 3 pods and creates web-7f-m4p". Surplus → delete in this order: unbound (no `node`) first, then not ready, then newest `createdAt`, ties to the lowest name; event `delete-pod`. Lost pods count until deleted. No difference → one note `reconcile`: "ReplicaSet web-7f sees 3 of 3 pods: nothing to do".
- **Scheduler**: unbound pods, oldest `createdAt` first then name. Candidates: Ready nodes whose free CPU (capacity − CPU of bound pods not Completed/Failed) ≥ the pod's request; pick the most free CPU, ties to the lowest name; event `bind` ("scheduler binds web-7f-m4p to node-2 (3 of 4 CPU free)"). No candidate → `unschedulable` with reason `0/3 nodes have 1 CPU free` (`0/N nodes are Ready` when none is Ready), written only when the reason differs from the pod's current one.
- **Endpoints**: for each Service, ready pods matching its selector, name order; create or update the Endpoints object of the same name only when the list changed; event `endpoints` ("Endpoints web: web-7f-a1b, web-7f-m4p").

- [ ] **Step 1: Write failing tests** (hand-built stores, `rng = seeded(SEED)`):
  - `creates the shortfall` (RS replicas 3, 1 pod → 2 `create-pod` changes, names start `web-7f-`, distinct).
  - `deletes in the stated order` (pods: one unbound, one not ready, two ready with createdAt 1 and 5; replicas 1 → deletes unbound, not-ready, then createdAt 5).
  - `notes a reconcile with nothing to do` (one change, no `write`, kind `reconcile`).
  - `counts Lost pods until they are deleted`.
  - `binds to the node with the most free CPU, ties to the lowest name` and `skips NotReady nodes`.
  - `leaves a pod Pending with the reason` (`'0/2 nodes have 1 CPU free'`) and `does not rewrite the same reason` (second call → `[]`).
  - `lists only ready matching pods` and `writes Endpoints only when the list changes`.
- [ ] **Step 2:** `npx vitest run src/kubernetes/controllers` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test` → pass.
- [ ] **Step 5: Commit** `git commit -m "Kubernetes engine: ReplicaSet, scheduler and Endpoints controllers"`

---

### Task 4: Deployment controller (rolling updates and rollback)

**Files:**
- Create: `src/kubernetes/controllers/deployment.ts`
- Test: `src/kubernetes/controllers/deployment.test.ts`

**Interfaces:**
- Consumes: `Ctx`, `Change`, `Reconcile`, `replicaSetName`, `resolveAmount`.
- Produces: `export const reconcileDeployments: Reconcile;`

Algorithm (the tests don't fix it, so it is pinned here). For each Deployment `d`:

```
current = RS owned by d whose template deep-equals d.template   // create it if missing (revision d.revision, replicas 0), event 'rollout'
olds    = other RSs owned by d, oldest revision first
maxTotal = d.replicas + resolveAmount(d.maxSurge, d.replicas, 'up')
minReady = d.replicas - resolveAmount(d.maxUnavailable, d.replicas, 'down')
total    = sum of RS.replicas (spec counts, not pods)
ready    = ready pods owned by any of d's RSs
// scale up the current RS
up = min(d.replicas - current.replicas, maxTotal - total); if up > 0: current.replicas += up      // event 'scale'
// scale down olds: not-ready old pods may always go; ready ones only while ready stays >= minReady
removable = max(0, ready - minReady) + (not-ready pods owned by olds)
for old in olds: cut = min(old.replicas, removable); old.replicas -= cut; removable -= cut          // event 'scale'
// with no olds left above 0 and current.replicas > d.replicas: scale current down to d.replicas
```

- `set-image` (applied by the simulator) pushes the old template onto `history`, sets the new image and bumps `revision`. `rollback` pops `history` into `template` and bumps `revision`; the matching old RS becomes `current` again, so no new RS is created.
- Event text examples: "Deployment web scales web-9c up to 2 (surge allows 5 pods in total)", "Deployment web scales web-7f down to 3 (3 pods must stay ready)".

- [ ] **Step 1: Write failing tests**, each running the reconciler plus simple stand-ins for the ReplicaSet controller and a "pods become ready at once" helper in a loop until nothing changes (helper in the test file):
  - `creates one ReplicaSet for a new Deployment and scales it to replicas`.
  - `keeps total ≤ replicas + surge and ready ≥ replicas − unavailable at every write`, for (replicas 4: `25%/25%`, `1/0`, `0/1`) and (replicas 2: `25%/25%`). Each ends with only the new RS at 4 (or 2) and the old RS at 0.
  - `stalls when new pods never become ready` (replicas 4, 25%/25%, new pods stay not ready): ends with old RS at 3 and new RS at 2; old ready pods never drop below 3.
  - `rolls back to the old ReplicaSet without creating a new one`: after the stall, rollback → old RS back to 4, bad RS to 0, RS count still 2.
- [ ] **Step 2:** `npx vitest run src/kubernetes/controllers/deployment.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test` → pass.
- [ ] **Step 5: Commit** `git commit -m "Kubernetes engine: Deployment controller with rolling updates and rollback"`

---

### Task 5: Kubelet, node lifecycle and the simulator

**Files:**
- Create: `src/kubernetes/kubelet.ts`, `src/kubernetes/nodes.ts`, `src/kubernetes/sim.ts`
- Test: `src/kubernetes/kubelet.test.ts`, `src/kubernetes/sim.test.ts`

**Interfaces:**
- Consumes: everything above; `EventQueue`, `seeded`.
- Produces:

```ts
export function backoffS(level: number): number;            // kubelet.ts: 10·2^level, capped at 160
export function simulate(scenario: Scenario): SimResult;     // sim.ts; never throws
```

Behaviour (the spec's section 1, made exact):
- **Queue order.** At equal times: faults, then actions, then component up/down, then everything else in push order. Faults at t apply before anything else at t.
- **Watch fan-out.** After each accepted write, every watcher group whose kinds include the object's kind gets one reconcile at `now + WATCH_S`, coalesced (at most one pending per group). Groups → component → kinds: `replicaset` → controllers → Pod, ReplicaSet; `deployment` → controllers → Deployment, ReplicaSet, Pod; `endpoints` → controllers → Pod, Service; `scheduler` → scheduler → Pod, Node; `kubelet` → kubelet → Pod.
- **Component outages.** A group whose component is down doesn't run; at `to` it runs once (level-triggered catch-up), with events `component-down` / `component-up`. With etcd down, writes fail with the store's reason (event `refuse-write`), and the group that tried retries once at the fault's `to`, not every second. A refused `apply` from kubectl is not retried.
- **Actions** (`by: 'kubectl'`, event `action`): `apply` writes the object; `scale` updates `replicas`; `set-image` / `rollback` as in Task 4; `delete-pods` deletes; `request` is routed by kube-proxy at once: read Endpoints of `service`; none (or no Service) → `request-fail` ("no endpoints for web: connection refused"); otherwise pick `pods[floor(rng() * length)]`; the request is `ok` if that pod is Running on a Ready node, else `failed` ("web-7f-x9k is not running: connection refused"). Event `route` names the pod.
- **Kubelet** (one per node, group `kubelet`): a pod bound to its node gets `ContainerCreating` and `pull` at once, then after `PULL_S` either the container starts or, for a `bad-image` image, `pull-fail` (phase `ImagePullBackOff`, reason `ErrImagePull`) and another pull after `backoffS(level++)`. A pull that succeeds is followed `START_S` later by `start` (phase `Running`, not ready), and `READY_S` after that by `ready`. A `crash` fault → `exit` after `afterS` running; Always, or OnFailure with exit code 1 → `back-off` (phase `CrashLoopBackOff`, ready false) for `backoffS(level)` then `restart` (`restarts + 1`, Running, ready after `READY_S`); the level resets to 0 when the container ran ≥ `BACKOFF_RESET_S`. Exit 0 under OnFailure or Never → `Completed`; exit 1 under Never → `Failed`. A `not-ready` fault sets `ready: false` (phase stays Running). A node that is down runs none of this and drops its pending kubelet work.
- **Nodes** (`nodes.ts`): every up node heartbeats each `HEARTBEAT_S` from t = 0 (writes `lastHeartbeat`, not traced). Every `NODE_CHECK_S`, a Ready node whose last heartbeat is older than `GRACE_S` becomes NotReady (`node-not-ready`, by controllers); its pods become `Lost` (`lost`), and `EVICT_S` later they are deleted (`delete-pod`), so their ReplicaSet replaces them. Node checks need the controllers component up.
- **Ending.** The run ends when no non-periodic work is queued, every action and fault time has passed, and every request is done; or at `until ?? MAX_TIME` (`cutOff: true` if work remained). Heartbeats and node checks don't keep a run alive.
- **Frames.** One frame per traced event, holding a deep snapshot of the state after it.

- [ ] **Step 1: Write failing tests**

`kubelet.test.ts`: `backoffS` for levels 0–6 → `[10, 20, 40, 80, 160, 160, 160]`.

`sim.test.ts` (small scenarios built inline):
- `runs a Deployment to 2 Running, ready pods`: the event kinds in order start `action, rollout, scale, create-pod, create-pod, bind, bind, pull, pull, start, start, ready, ready`; final state 2 pods Running+ready on different nodes.
- `repeats exactly` (`simulate(s)` twice → `toEqual`).
- `keeps pods Pending while the scheduler is down, then binds them all at once at 30 s` (no `bind` before 30 s; every `bind` has `t === 30`, the time of `component-up`).
- `refuses the apply while etcd is down and changes nothing` (one `refuse-write` event; no pods).
- `backs off 10, 20, 40 s between restarts` (bare Pod, Always, crash after 5 s, until 200): gaps between consecutive `exit` and the following `restart` = 10, 20, 40, 80.
- `completes on exit 0 under OnFailure`, `fails on exit 1 under Never`.
- `faults first`: node-2 down at the bind time of a pod → that pod becomes Lost at the first node check after `GRACE_S`, is deleted `EVICT_S` later, and a replacement is bound to another node.
- `stalls a bad-image rollout and keeps v1 serving` (replicas 4, 25%/25%): ready v1 pods ≥ 3 in every frame.
- `routes requests with the seeded rng` and `refuses requests with no endpoints`.
- `stops a never-ending crash loop at until` (`cutOff: true`, `endedAt === until`).

- [ ] **Step 2:** `npx vitest run src/kubernetes` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test` → pass.
- [ ] **Step 5: Commit** `git commit -m "Kubernetes engine: kubelet, node lifecycle and the simulator"`

---

### Task 6: `ClusterView`, roles, view builder and steps

**Files:**
- Modify: `src/types/visualization.ts` (add `ClusterView` exactly as in spec section 2, minus `Terminating` in the phase comment; add to `View`), `src/components/visualization/roles.ts` (`cluster` case)
- Create: `src/kubernetes/view.ts`, `src/kubernetes/steps.ts`
- Test: `src/kubernetes/steps.test.ts`, extend `src/components/visualization/roles.test.ts`

**Interfaces:**
- Produces:

```ts
// view.ts
export function emptyClusterView(): ClusterView;
export function clusterView(frame: Frame, log: string[]): ClusterView;
// steps.ts
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
export function traceSteps(result: SimResult, options: StepOptions): Step[];
```

- **Roles** (`view.ts`): a pod is `active` if this event names it, else Running+ready → `found`; Pending / ContainerCreating / Running not ready → `frontier`; CrashLoopBackOff / ImagePullBackOff / Failed / Lost → `discarded`; Completed → `sorted`. A node box is `active` when the event's `node` is it, `discarded` when NotReady, else `default`. A control-plane component is `active` when the event's `by` maps to it (`kubectl` and `api-server` → api-server; `controllers` → controllers; `scheduler` → scheduler; a write's step also lights etcd only for `refuse-write`), `discarded` with badge `down` while in `down`.
- **Objects table**: Deployments (desired `replicas`, current = pods of its RSs, ready), then ReplicaSets (desired `replicas`, current = its pods, ready, note `v<revision>`), then Services (note `N endpoints`). Bare pods are not listed. Role `active` when desired ≠ current, else `default`.
- **Steps**: title = `explain().title ?? event.text`; `why` from a per-kind default table in `steps.ts` (e.g. `create-pod`: "The ReplicaSet wants N pods and counts M, so it makes up the difference."); `next` = the next kept step's title. `variables`: `t` (`"12 s"`), and for `focus`: `desired`, `current`, `ready`. Consecutive frames with the same `kind`, `by` and `t` merge into one step listing every subject ("ReplicaSet web-7f creates 3 pods: web-7f-a1b, web-7f-k2m, web-7f-x9k"); no-op `reconcile` notes are dropped unless `noops`. Log = the last 4 kept titles, each prefixed `t=12 s ·`. Over `MAX_STEPS`, step 201 is a summary: "After N s: Deployment web has 3 of 4 pods ready; 7 requests ok, 3 failed".

- [ ] **Step 1: Write failing tests** (`steps.test.ts`, on small `simulate` runs):
  - `merges same-second creates into one step` (replicas 3 → one step whose title lists 3 pod names).
  - `hides no-op reconciles unless asked`.
  - `puts every codeLine inside the code` and `uses lineOf for mapped kinds`.
  - `fills variables for the focus workload` (`desired: 3`, `current`, `ready` numbers).
  - `ends with a summary step past MAX_STEPS` (crash loop with until 600 and replicas 6 → length `MAX_STEPS + 1`, last title starts `After`).
  - `marks Lost pods discarded and NotReady nodes discarded` (view roles).
  - `never repeats a pod name across nodes and the pending tray`.
  - `roles.test.ts`: `rolesInView` covers a cluster view's components, nodes, pods, pending, objects and requests (`ok` → `found`, `failed` → `discarded`).
- [ ] **Step 2:** `npx vitest run src/kubernetes/steps.test.ts src/components/visualization/roles.test.ts` → FAIL.
- [ ] **Step 3: Implement.** TypeScript will flag `renderers/index.tsx` until Task 7; add a temporary `case 'cluster': return null;` there and replace it in Task 7.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test` → pass.
- [ ] **Step 5: Commit** `git commit -m "Kubernetes engine: cluster view and trace steps"`

---

### Task 7: `ClusterRenderer`

**Files:**
- Create: `src/components/visualization/renderers/ClusterRenderer.tsx`
- Modify: `src/components/visualization/renderers/index.tsx` (`case 'cluster'`), `src/index.css` only if a needed token is missing

**Interfaces:**
- Consumes: `ClusterView`; `roleBoxStyle`, `ROLE_META` from `roles.ts`.
- Produces: `ClusterRenderer({ view }: { view: ClusterView })`.

Layout, top to bottom, each part its own small component in the file: `ControlPlane` (a row of four role-styled chips), `NodeGrid` → `NodeBox` (name, NotReady mark `✕ NotReady`, `PodChip`s that wrap, a CPU bar `used/capacity CPU` with `role="meter"` and `aria-valuenow/min/max`), `PendingTray` (only when non-empty, each chip with its reason), `ObjectsTable` (a real `<table>` with a caption, columns Kind, Name, Desired, Current, Ready, Note), `RequestList` (only when `requests` is present), and the log (`<ol>`, newest last). Pod chips show the role mark from `ROLE_META` so phases never depend on colour alone, plus the phase text. The node grid is `grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))]`; nothing sets a fixed width, so the view never scrolls sideways at 375 px.

- [ ] **Step 1:** Implement and wire the renderer (no DOM tests in this codebase).
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test` → pass.
- [ ] **Step 3: Commit** `git commit -m "Cluster view renderer"`

Browser checks wait for the first lesson (Task 8).

---

### Tasks 8–14: the seven lessons

Every lesson task has the same shape:

**Files:** create `src/kubernetes/scenarios/<id>.ts` (+ `.test.ts`), `src/lessons/kubernetes/<id>.ts`; modify `src/lessons/meta/kubernetes.ts` (append its meta: `category: 'kubernetes'`, `difficulty: 'beginner'`, `group: 'Foundations'`, a one-line description, 6–8 keywords, `prerequisites` = the previous lesson's id, none for the first), and `lessons.test.ts` (`EXPECTED_IDS` gets the id appended; the Kubernetes count goes up by one).

**Interfaces:** `<id>Code: string`, `<id>Scenario(values): Read<Scenario>`, `<id>Steps(values): Step[]` (camelCase id, e.g. `clusterArchitectureSteps`), built with `scenarioSteps` from `scenarios/shared.ts` (Task 8 creates it: `nodes(count, cpu = 4)`, `deployment(name, replicas, opts)`, `replicaSet(...)`, `service(name, selector)`, `pod(name, template)`, `appTemplate(app, image = 'app:v1', cpu = 1)`, and `scenarioSteps(read, refusalTitle, options)` → `refusal(refusalTitle, read.why, emptyClusterView())` or `traceSteps(simulate(read.value), options)`).

**Steps for each:**
- [ ] Write the scenario test: each preset's teaching moment, checked on `simulate(<id>Scenario(preset).value)` frames (listed per lesson below), plus `refuses out-of-range values` (one step, title is the refusal title).
- [ ] Run it: `npx vitest run src/kubernetes/scenarios/<id>.test.ts` → FAIL.
- [ ] Write the scenario module (pseudocode ≤ 20 lines; `lines` maps every narrated kind) and the lesson content (all sections, quiz per Global Constraints, timings called out where shortened, the first preset matching the field samples).
- [ ] `npm run typecheck && npm run lint && npm test` → pass.
- [ ] `npm run dev`, open the lesson, step through every preset in light and dark mode at desktop width and at 375 px.
- [ ] Commit `git commit -m "Kubernetes lesson: <Title>"`.

### Task 8: Cluster Architecture (+ `scenarios/shared.ts` and the contract test)

Fields: `nodes` number 1–3 (sample 3), `replicas` number 1–3 (sample 2), `fault` choice `none | scheduler-down | etcd-down` (sample `none`). Presets: Happy path · Scheduler down (down 0–30 s) · etcd down (down 0–30 s; apply at 2 s). Code lines: `kubectl apply` → api-server stores → controller creates pods → scheduler binds → kubelet starts.

Teaching moments: happy path ends with `replicas` pods Running+ready; scheduler down: no `bind` before 30 s, then all binds at 30 s; etcd down: exactly one `refuse-write`, no pods ever exist.

Also create `src/kubernetes/contract.test.ts`, modelled on `src/microservices/contract.test.ts` (same `valueFor`, `GARBAGE`, `RANGES` approach, seeds 1–3, 20 runs each): for every `kubernetes` lesson: `codeLabel === 'Pseudocode'`; 1 ≤ steps ≤ `MAX_STEPS + 1`; every `codeLine` in range; `view.kind === 'cluster'`; pod names unique across all nodes and the pending tray; object rows unique by kind+name; when `requests` exist, none is `pending` in the last step; `generate` twice → equal; the largest and smallest values of every range with every preset run to > 1 step. `RANGES` grows with each lesson task.

### Task 9: Pods

Fields: `policy` choice `Always | OnFailure | Never` (sample `Always`), `exit` choice `1 | 0` (sample `1`), `crashAfter` choice `5 | 15` (sample `5`). One bare Pod, `until: 400`. Presets: Crashes and backs off · Exit 0 with OnFailure · Never.

Teaching moments: Always/1: back-off gaps 10, 20, 40, 80, 160 and `restarts` counts up; with `crashAfter` 15 the gaps are the same (it never runs 60 s); OnFailure/0 → `Completed`, no `restart`; Never/1 → `Failed`, no `restart`.

### Task 10: Labels & Selectors

No simulation: a fixed cluster of 6 labelled pods on 2 nodes (`app` web/api, `tier` fe/be, `env` prod/dev, one with `track: canary`). Fields: `key` choice `app | tier | env | track`, `op` choice `= | != | in | notin | exists`, `values` text (comma-separated, ≤ 3 values, each 1–12 of `[a-z0-9-]`; ignored for `exists`). Steps: one per pod, in name order, using `explainMatch`: title "web-a1 matches app=web" / "api-b2 doesn't match: app=web fails", matching pods `found`, rejected pods `discarded`, then a closing step "3 of 6 pods match app=web". Refusals: `in` / `notin` without values; `=` / `!=` with more than one value. Presets: `app=web` · `tier in (fe,be)` · `env!=prod` · A typo (`app=wbe`, 0 matches).

Teaching moments: counts 3, 6, 3, 0 matching pods; `env!=prod` also matches a pod with no `env` label.

### Task 11: Desired State & Controllers

Fields: `desired` number 1–5 (sample 3), `deleted` number 0–3 (sample 1, capped at `desired`), `outage` choice `off | on` (sample `off`). Pods are deleted at 15 s; with the outage on, the controllers are down from 10 s to 40 s. `noops: true`. Presets: Delete one pod · Delete three while the controller is down · Desired already matches (`deleted` 0).

Teaching moments: one deletion → one `create-pod` 1 s later; three deletions during the outage → no `create-pod` before 40 s, then all three `create-pod` events at 40 s (one merged step); deleted 0 → a `reconcile` note "sees 3 of 3 pods: nothing to do" and no `create-pod` after the first rollout.

### Task 12: ReplicaSets

A ReplicaSet `web` applied directly (no Deployment). Fields: `replicas` number 1–6 (sample 3), `scaleTo` number 0–6 (sample 5; scale at 20 s), `nodeDown` choice `off | on` (sample `off`; node-2 down at 20 s, no scale when on — `scaleTo` ignored). 3 nodes. Presets: Scale 3 → 5 · Scale 5 → 2 · Node dies, pods move.

Teaching moments: 3 → 5 creates exactly 2 pods; 5 → 2 deletes 3, newest first; node down: node-2's last heartbeat is at 10 s (the fault at 20 s applies before that second's heartbeat), so it goes NotReady at the 35 s node check, its pods are Lost at 35 s and deleted at 45 s, and the same number of new pods bound to node-1/node-3.

### Task 13: Deployments & Rolling Updates

Fields: `replicas` number 2–6 (sample 4), `surge` choice `25% | 1 | 0` (sample `25%`), `unavailable` choice `25% | 1 | 0` (sample `25%`), `image` choice `good | bad` (sample `good`; `set-image` to `app:v2` or `app:v2-typo` at 15 s), `rollback` choice `off | on` (sample `off`; at 60 s). `focus: 'web'`. Refusal when surge and unavailable both resolve to 0 (e.g. `0` and `0`, or `0` and `25%` at 2 replicas): "maxSurge and maxUnavailable can't both be 0…". Presets: Default 25% / 25% · Surge 1, unavailable 0 · Surge 0, unavailable 1 · Bad image stalls · Bad image, then rollback.

Teaching moments: in every frame of every preset total pods ≤ replicas + surge and ready ≥ replicas − unavailable; surge 1/unavailable 0 → ready never below 4; bad image → ends with v1 at 3 ready and v2 pods in `ImagePullBackOff`; rollback → ends with 4 v1 pods ready, v2 RS at 0.

### Task 14: Services & kube-proxy (+ docs and final verification)

A Deployment `web` (pods labelled `app: web`) and a Service `web` selecting `app=web` (or `app=wbe` for the typo). Fields: `replicas` number 1–4 (sample 3), `notReady` choice `off | on` (sample `off`; the first web pod goes not-ready 4 s after the first request), `selector` choice `correct | typo` (sample `correct`). 10 requests, one per second, starting at 10 s (pods are ready by then). Presets: Even spread · Pod goes not-ready · Selector typo.

Teaching moments: correct → 10 ok, spread over every pod; not-ready → the pod leaves Endpoints 1 s after it goes not-ready, a request routed to it before Endpoints updates still succeeds because it is Running, and none is routed to it after; typo → Endpoints empty, 10 failed with "no endpoints".

Then finish the phase:
- [ ] `README.md`: add Kubernetes to the intro, the track list and "How to add a lesson" (a Kubernetes scenario is like a Microservices one: scenario module + lesson content + meta).
- [ ] `CLAUDE.md`: intro sentence names Kubernetes; a **Kubernetes** bullet under Architecture (store + level-triggered controllers + kubelet/nodes + `simulate` frames + `traceSteps`, seconds, `MAX_STEPS = 200`, scenarios in `scenarios/`); `View` count 17 including `cluster`; the contract test under "Tests that guard the whole codebase"; `seeded` and `EventQueue` now in `src/utils/`.
- [ ] Run: `npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all pass, first-load JS under 600 kB (note the number for the PR).
- [ ] Browser: Header still fits on one line at 1280 px with seven links (if not, shorten it the way the existing links are handled); Home and Dashboard show the Kubernetes bar; the catalog shows 7 live lessons and 16 Coming soon; search finds "rolling update".
- [ ] Commit `git commit -m "Docs: Kubernetes phase 1"`, then the final whole-branch review, then push and open the PR (ask before merging).
