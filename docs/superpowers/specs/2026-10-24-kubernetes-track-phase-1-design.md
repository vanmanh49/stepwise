# Kubernetes track, phase 1: foundations

Date: 2026-10-24
Status: approved design, awaiting spec review

## Goal

Add a fifth category, **Kubernetes**, that teaches learners how Kubernetes works by watching a simulated cluster reconcile desired state: controllers create and replace pods, the scheduler places them, kubelets start and restart them, and Services route to the ready ones. Phase 1 builds the simulator engine and a new `cluster` view, and makes the 7 **Foundations** topics live. The other 16 topics show as Coming soon.

## Decisions

- **Understand how Kubernetes works, not write manifests.** No YAML editor and no kubectl interpreter. Knobs are form fields; lesson code is short pseudocode for the decision being made (reconcile, pick a node, pick an endpoint).
- **Own category**, next to Data Structures, Algorithms, SQL and Microservices.
- **Phase by phase.** Phase 1 = engine + Foundations (this spec). Phase 2 = Scheduling & Health. Phase 3 = Workloads & Operations. Each phase has its own spec, plan and PR.
- **A new reconciliation simulator** (`src/kubernetes/`), not an extension of the Microservices simulator: Kubernetes is driven by controllers watching a shared object store, not by request messages. Phases 2 and 3 add controllers; the event loop does not change.
- **The existing `form` input** drives every lesson (knobs = fields, scenarios = presets). There is no new input kind.
- **One new view kind, `cluster`**, carries the whole picture.
- One spec, one plan, one PR on branch `kubernetes-phase-1`, inside the `stepwise` folder (no worktree). Ask before merging.

## Curriculum

All 23 topics go into `curriculum.ts` under category `kubernetes`, with a group per difficulty:

| Difficulty | Group | Topics (id: title) |
|---|---|---|
| beginner | Foundations | `cluster-architecture`: Cluster Architecture · `pods`: Pods · `labels-selectors`: Labels & Selectors · `desired-state-controllers`: Desired State & Controllers · `replicasets`: ReplicaSets · `deployments-rolling-updates`: Deployments & Rolling Updates · `services-kube-proxy`: Services & kube-proxy |
| intermediate | Scheduling & Health | `scheduler`: The Scheduler · `requests-limits`: Requests & Limits · `probes`: Liveness, Readiness & Startup Probes · `taints-tolerations`: Taints & Tolerations · `affinity`: Affinity & Anti-affinity · `hpa`: Horizontal Pod Autoscaler · `cluster-autoscaler`: Cluster Autoscaler · `draining-pdb`: Draining & PodDisruptionBudgets |
| advanced | Workloads & Operations | `configmaps-secrets`: ConfigMaps & Secrets · `volumes-pv-pvc`: Volumes, PV & PVC · `statefulsets`: StatefulSets · `daemonsets`: DaemonSets · `jobs-cronjobs`: Jobs & CronJobs · `ingress`: Ingress · `network-policies`: Network Policies · `operators-crds`: Operators & CRDs |

Only the 7 Foundations topics are registered in phase 1.

## 1. Engine (`src/kubernetes/`)

No React, the same layering as `microservices/`. Entry points never throw.

### Model (`model.ts`)

A **scenario** has:

- **Cluster.** Worker nodes with a name (`node-1`…), CPU capacity in cores and a Ready flag.
- **Objects.** `Pod` (name, labels, owner, node, phase, ready, restarts, image, CPU request), `ReplicaSet` (replicas, selector, pod template, owner), `Deployment` (replicas, selector, template, `maxSurge`, `maxUnavailable`, revision history), `Service` (selector), `Endpoints` (ready pod names per Service). Pod names are the owner's name plus a seeded 3-letter suffix (`web-7f-x9k`).
- **Actions** the learner's "kubectl" performs at given times: `apply` an object, `scale` a Deployment or ReplicaSet, `set-image`, `delete-pod`, `rollback`, `request` (a client call to a Service, for lesson 7).
- **Faults.** `node-down <node> at t`, `crash <pod or template> after s with exit code`, `bad-image <image>` (pull fails), `not-ready <pod> at t`, `down <scheduler | controllers | etcd> from t to t`.

### API server (`store.ts`)

A versioned object store standing in for the API server backed by etcd. Every write bumps a global `resourceVersion` and raises a watch event (`added`, `modified`, `deleted`) delivered to every controller subscribed to that kind after a fixed watch latency. While etcd is down, writes are refused with a reason and nothing changes.

### Controllers (`controllers/*.ts`)

Each controller is a pure function `(store snapshot, event) → writes`. Controllers are **level-triggered**: on each event they re-read the whole current state and act on the difference between desired and actual, not on the event's own diff. That is the point of lesson 4: a controller that missed events while down still converges in one pass. Phase 1 controllers:

- **ReplicaSet**: counts live pods matching its selector; creates the shortfall from its template, or deletes the surplus in a fixed order: unscheduled (Pending) first, then not ready, then the newest; ties go to the lowest name.
- **Deployment**: owns one ReplicaSet per template revision. On a template change it creates a new ReplicaSet and steps the old one down and the new one up, keeping total pods ≤ replicas + `maxSurge` and ready pods ≥ replicas − `maxUnavailable` at every step (both accept a count or a percentage; surge rounds up, unavailable rounds down, as Kubernetes does). If the new pods never become ready the rollout stalls and the old pods keep serving. `rollback` restores the previous revision's template.
- **Scheduler**: binds each Pending pod to a node. Phase 1 rule: nodes that are Ready and have enough free CPU for the pod's request; among them the one with the most free CPU; ties go to the lowest name. No fit leaves the pod Pending with the reason ("0/3 nodes have 1 CPU free"). Phase 2 replaces this with filter → score plugins.
- **Kubelet** (one per node): for each pod bound to its node, pulls the image (fails on `bad-image`: `ErrImagePull`, then `ImagePullBackOff`), starts the container (`ContainerCreating` → `Running`), and marks it ready after a start delay. On a container exit it applies the restart policy (`Always`, `OnFailure`, `Never`); restarts back off 10 s, 20 s, 40 s, … capped at 160 s (`CrashLoopBackOff`), and the back-off resets after 60 s running. It sends a heartbeat every 10 s while its node is up.
- **Node lifecycle**: marks a node NotReady once its last heartbeat is older than the grace period (20 s here; 40 s by default in Kubernetes), then marks its pods `Lost` and deletes them after an eviction delay (10 s here; 5 min by default), so their ReplicaSet replaces them elsewhere.
- **Endpoints**: for each Service, the names of pods that match its selector and are ready.
- **kube-proxy**: routes each `request` to one endpoint chosen with the seeded random number generator (as in iptables mode); with no endpoints the request fails ("connection refused: no endpoints").

### Simulator (`sim.ts`)

- Simulated **seconds**; no real timers.
- An event queue ordered by `(time, sequence)`, so runs are fully deterministic.
- Randomness comes only from `seeded` (mulberry32), moved from `src/microservices/sim.ts` to `src/utils/random.ts` so both simulators import it, with a fixed seed: pod-name suffixes and kube-proxy endpoint picks.
- **Trace events:** `action`, `write`, `refuse-write`, `watch`, `reconcile`, `create-pod`, `delete-pod`, `bind`, `unschedulable`, `pull`, `pull-fail`, `start`, `ready`, `not-ready`, `exit`, `restart`, `back-off`, `heartbeat`, `node-not-ready`, `lost`, `endpoints`, `route`, `request-fail`, `fault`, `component-down`, `component-up`. Each carries the time, the component that acted, and the object names involved.
- **Limits.** The run stops at `MAX_TIME` (600 s) or once nothing is scheduled and every request has finished. Steps are capped at `MAX_STEPS` (200); beyond the cap, a final summary step reports desired vs actual for every workload and the outcome of each remaining request.

### Steps (`steps.ts`)

- Turns trace events into `Step[]`: `title` says what happened, with real values ("ReplicaSet `web-7f` sees 2 of 3 pods and creates `web-7f-m4p`"), `why` says why, and `next` says what comes next.
- `codeLine` points into the lesson's pseudocode through `lineOf` (`src/data-structures/shared.ts`).
- `variables` include `t` (s) and, for the workload in focus, desired, current and ready.
- Consecutive events that teach nothing new (a heartbeat that changes nothing, a watch event that triggers a no-op reconcile) are merged into one step.

### Invalid input

Out-of-range knobs (0 nodes, more than 4 nodes, more than 6 replicas, `maxSurge` and `maxUnavailable` both 0, a fault time after `MAX_TIME`, an empty selector) return one explanatory step through `refuse` (`src/data-structures/shared.ts`), and no simulation runs.

### Scenario modules (`src/kubernetes/scenarios/<id>.ts`)

Each exports `fooCode` (pseudocode), `fooScenario(values)` (form values → a scenario, or the reason they are unusable) and `fooSteps(values)`, which builds the scenario and runs it, the same contract as the Microservices track. Tests call `fooScenario` + `simulate` to check outcomes directly. Lesson content (text, fields, presets, quiz) lives in `src/lessons/kubernetes/<id>.ts`.

## 2. The `cluster` view

```ts
interface ClusterView {
  kind: 'cluster';
  /** The control-plane components; the one acting in this step has role 'active'. */
  controlPlane: { id: 'api-server' | 'etcd' | 'scheduler' | 'controllers'; label: string; role: Role; badge?: string }[];
  nodes: {
    name: string;
    ready: boolean;
    role: Role;
    /** CPU requested by its pods vs capacity, in cores. */
    cpu: { used: number; capacity: number };
    /** phase: Pending | ContainerCreating | Running | CrashLoopBackOff | ImagePullBackOff | Completed | Failed | Terminating | Lost. */
    pods: { name: string; phase: string; ready: boolean; role: Role; badge?: string }[];
  }[];
  /** Pods not bound to any node yet. */
  pending: { name: string; role: Role; reason?: string }[];
  /** Workload objects: desired vs current vs ready; reconciling = desired and current differ. */
  objects: { kind: string; name: string; desired?: number; current?: number; ready?: number; note?: string; role: Role }[];
  /** Client requests to a Service (lesson 7). */
  requests?: { id: string; label: string; status: 'pending' | 'ok' | 'failed'; endpoint?: string; reason?: string }[];
  /** The last few events, newest last. */
  log: string[];
}
```

`ClusterRenderer` draws, top to bottom: the control-plane strip, one box per worker node (pod chips with name and phase, a CPU bar, a NotReady mark), a Pending tray, the objects table, the requests list when present, and the log. Pod chips and components use the existing `Role` palette (`roleFill`, `roleText`), so light and dark themes work as they already do. `clusterLayout.ts` wraps node boxes into rows by measured stage width, so the view works at phone width.

## 3. Lessons (Foundations, beginner)

| id | What the learner watches | Knobs | Presets |
|---|---|---|---|
| `cluster-architecture` | `kubectl apply` of a Deployment, step by step: api-server validates and stores in etcd → Deployment and ReplicaSet controllers create pods → scheduler binds → kubelet pulls and starts → Running. | nodes 1–3 · replicas 1–3 · fault: none / scheduler down / etcd down | Happy path · Scheduler down (pods stay Pending until it returns at 30 s, then bind) · etcd down (the apply is refused; nothing changes) |
| `pods` | One pod's lifecycle and restart policy, with the CrashLoopBackOff delay doubling. | restartPolicy Always / OnFailure / Never · exit code 0 / 1 · crash after 5 / 15 s | Crashes and backs off · Exit 0 with OnFailure (Completed, no restart) · Never (stays Failed) |
| `labels-selectors` | Six labelled pods; a selector is evaluated against each one, matching pods light up, and each step names the label that decided it. | key · operator (`=`, `!=`, `in`, `notin`, `exists`) · values | `app=web` · `tier in (fe,be)` · `env!=prod` · A typo that matches nothing |
| `desired-state-controllers` | A generic reconcile loop (observe → diff → act). Pods are deleted by hand; with the controller down for a while, it repairs all the drift in one pass on recovery (level-triggered). | desired 1–5 · pods deleted 1–3 · controller outage off / on | Delete one pod · Delete three while the controller is down · Desired already matches (no-op) |
| `replicasets` | Scaling up and down, and a node failure. Scale-down follows the fixed deletion order; a dead node's pods go Lost after the grace period and are replaced on healthy nodes. | replicas 1–6 · scale to 0–6 · node-2 dies: off / at 20 s | Scale 3 → 5 · Scale 5 → 2 · Node dies, pods move |
| `deployments-rolling-updates` | A v1 → v2 rollout under `maxSurge` / `maxUnavailable`, with old and new ReplicaSet counts side by side; a bad image stalls the rollout while v1 keeps serving; then a rollback. | replicas 2–6 · maxSurge 0 / 1 / 25% · maxUnavailable 0 / 1 / 25% · image good / bad · rollback off / on | Default 25% / 25% · Surge 1, unavailable 0 (full capacity throughout) · Surge 0, unavailable 1 · Bad image stalls · Bad image, then rollback |
| `services-kube-proxy` | The Endpoints controller builds the ready-pod list; a client sends 10 requests to the ClusterIP and kube-proxy picks an endpoint for each; a pod going not-ready leaves the list; a selector typo gives no endpoints. | replicas 1–4 · a pod goes not-ready: off / at 4 s · selector correct / typo | Even spread · Pod goes not-ready · Selector typo |

Every lesson carries the same content sections as Microservices lessons: overview, concept, howItWorks, pseudocode (`codeLabel: 'Pseudocode'`), prosCons, applications, commonMistakes and a quiz. Kubernetes terms are used as-is and explained once. Each shortened timing is called out in the text ("20 s grace here; 40 s by default").

## 4. Plumbing

The same places PR #18 touched for Microservices: `Category` in `src/types/lesson.ts`, `View` in `src/types/visualization.ts`, `labels.ts`, `curriculum.ts`, `meta/kubernetes.ts`, `registry.ts`, `all.testutil.ts`, `App.tsx`, `Header.tsx`, `SearchPalette.tsx`, `Catalog.tsx`, `Home.tsx`, `Dashboard.tsx`, `LessonPage.tsx` (where it switches on category), `renderers/index.tsx`, `roles.ts`, `index.css` (pod-phase colours if roles don't cover them), `lessons.test.ts`, `split.test.ts`, `README.md`, `CLAUDE.md`.

## 5. Testing

- **Store:** versions increase, watch events reach every subscriber of the kind, etcd-down writes are refused and change nothing.
- **Controllers** on hand-built states: ReplicaSet creates or deletes exactly the difference, in the stated deletion order; Deployment bounds (total ≤ replicas + surge, ready ≥ replicas − unavailable) hold at every step of every rollout preset; a bad-image rollout never drops v1 below the bound; scheduler fit, most-free choice and tie-break; kubelet back-off sequence 10, 20, 40, 80, 160, 160 and reset; node-lifecycle grace and eviction timing; Endpoints keeps only ready, matching pods.
- **Simulator:** same scenario → same trace; runs stop at `MAX_TIME` / `MAX_STEPS` with a summary step.
- **Scenario tests per lesson:** each preset's outcome checked from `fooScenario` + `simulate` (for example "bad image: v1 keeps 3 ready pods throughout", "selector typo: all 10 requests fail").
- **Steps:** titles carry real values, every `codeLine` is in range, merged steps never hide a state change.
- **Contract:** `src/kubernetes/contract.test.ts` runs every Kubernetes lesson with random and garbage settings, like the Microservices contract test: every run ends, stays within `MAX_STEPS + 1` steps, has valid code lines and view references (every pod chip's name is unique, every object row names a real object), and repeats exactly.
- **View:** `clusterLayout` unit test (rows wrap at narrow widths).
- **Lesson registry:** the existing `lessons.test.ts` and `split.test.ts` cover the new category.
- **CI gates:** `npm test`, `npm run lint`, `npm run build`, `npm run check:bundle` (600 kB first-load budget; lesson content and engines are code-split, so only metadata and the renderer land on first load).
- **Manual:** run the app and step through every preset in light and dark mode, at desktop and phone width.

## Out of scope (phase 1)

YAML and kubectl syntax; namespaces; probes as configurable objects (phase 2: lesson 7 uses a `not-ready` fault instead); resource limits and QoS (phase 2); everything in Workloads & Operations (phase 3).
