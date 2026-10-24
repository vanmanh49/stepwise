# Kubernetes Track, Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 8 Scheduling & Health lessons live by extending the phase 1 Kubernetes simulator with resources and load, a filter → score scheduler, probes, the HPA, the Cluster Autoscaler, and the eviction API with PDBs.

**Architecture:** Everything extends `src/kubernetes/`: optional model fields (absent = phase 1 behaviour), new pure controllers (`controllers/hpa.ts`, `controllers/autoscaler.ts`), and new per-run modules called by the simulator (`metrics.ts`, `probes.ts`, `evict.ts`). New periodic simulator items: `metrics`, `hpa`, `autoscaler`. `ClusterView` gains optional parts and `ClusterRenderer` small components for them.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite, Vitest, Tailwind, Oxlint.

**Spec:** `docs/superpowers/specs/2026-10-24-kubernetes-track-phase-2-design.md`

## Global Constraints

- Branch `kubernetes-phase-2` in the `stepwise` folder (exists; spec committed). No worktrees.
- Every phase 1 test passes unchanged, except the two scheduler-reason assertions Task 2 updates to the real-style message.
- New model fields are optional; absent fields give phase 1 behaviour.
- Timings (s): metrics 5 · HPA sync 5 · HPA stabilisation 30 · HPA tolerance 0.1 · autoscaler scan 5 · node boot 20 · scale-down unneeded 60 at < 50% requested · eviction retry 5 · default probe period 2, failure threshold 3 · base pod memory 64 MiB · default node memory 8192 MiB.
- CPU in millicores everywhere new; phase 1 `cpu` (cores) counts as `cpu × 1000` millicores when `resources.cpu.request` is absent.
- Messages follow Kubernetes: `0/N nodes are available: …`, `Insufficient cpu`, `node(s) had untolerated taint {k: v}`, `OOMKilled`, `Cannot evict pod as it would violate the pod's disruption budget`.
- Lessons: `codeLabel: 'Pseudocode'`, no `complexity`, quiz 4–5 questions, ≥ 3 types, ≥ 1 with `view`; shortened timings called out in the text.
- No AI attribution in commits or PRs. Every task ends green on `npm run typecheck && npm run lint && npm test`; commit only after that passes.

## Review Focus

- **A run with only periodic work** (HPA waiting out its stabilisation window, a blocked drain): it must keep going to `until` when the scenario asks (`runToEnd`), and stop at the summary otherwise. Pinned in Task 6 (HPA) and Task 3 (blocked drain).
- **Probes on a pod that is deleted or restarted mid-period**: stale probe timers must do nothing (generation check, as phase 1 kubelet timers). Pinned in Task 5.
- **An HPA whose target pods have no CPU request**: it reports "missing request for cpu" once and never scales. Pinned in Task 6.
- **Autoscaler with a Pending pod too big for any pool node**: no node is added. Pinned in Task 7.
- **Phase 1 lessons after every engine change**: they still produce identical steps. Pinned by the unchanged phase 1 scenario and contract tests, run in every task.

---

## File map

| File | Responsibility |
|---|---|
| `src/kubernetes/model.ts` | new types, timings, `cpuRequestM`, `qosOf`, `tolerates` |
| `src/kubernetes/controllers/scheduler.ts` | filter → score, grouped reason, breakdown |
| `src/kubernetes/evict.ts` | eviction API with PDBs, drain, NoExecute |
| `src/kubernetes/metrics.ts` | traffic share, CPU throttle, memory, OOMKill, node pressure |
| `src/kubernetes/probes.ts` | startup / liveness / readiness |
| `src/kubernetes/controllers/hpa.ts` | HPA |
| `src/kubernetes/controllers/autoscaler.ts` | Cluster Autoscaler |
| `src/kubernetes/sim.ts`, `kubelet.ts`, `env.ts` | wiring of the above |
| `src/kubernetes/view.ts`, `steps.ts` | new view parts, merge key, new trace kinds' narration |
| `src/types/visualization.ts`, `roles.ts`, `ClusterRenderer.tsx` | view type, roles, rendering |
| `src/kubernetes/scenarios/<id>.ts`, `src/lessons/kubernetes/<id>.ts` | the 8 lessons |

---

### Task 1: Model additions

**Files:** Modify `src/kubernetes/model.ts`, `src/kubernetes/sim.ts` (node creation reads the new optional node fields), `src/kubernetes/store.ts` (snapshot lists the new kinds). Test: `src/kubernetes/model.test.ts`.

**Produces** (all new fields optional unless stated):

```ts
export const METRICS_S = 5, HPA_SYNC_S = 5, HPA_STABILISE_S = 30, HPA_TOLERANCE = 0.1, CA_SCAN_S = 5, NODE_BOOT_S = 20,
  CA_UNNEEDED_S = 60, CA_UTILISATION = 0.5, EVICT_RETRY_S = 5, PROBE_PERIOD_S = 2, PROBE_THRESHOLD = 3, BASE_MEMORY_MI = 64, NODE_MEMORY_MI = 8192;
export interface Taint { key: string; value: string; effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute' }
export interface Toleration { key: string; operator: 'Equal' | 'Exists'; value?: string; effect?: Taint['effect']; seconds?: number }
export interface AntiTerm { selector: Selector; topologyKey: 'kubernetes.io/hostname' | 'zone' }
export interface Probe { periodS: number; failureThreshold: number; initialDelayS?: number }
export interface Resources { cpu?: { request?: number; limit?: number }; memory?: { request?: number; limit?: number } }
// NodeObj += labels?: Labels; taints?: Taint[]; unschedulable?: boolean; memory?: number; booting?: boolean; pool?: boolean
// Template += resources?; tolerations?: Toleration[]; affinity?: { node?: { required?: Selector; preferred?: { weight: number; selector: Selector }[] };
//   podAnti?: { required?: AntiTerm; preferred?: { weight: number; term: AntiTerm }[] } }; probes?: { liveness?: Probe; readiness?: Probe; startup?: Probe }
// Pod += those template fields, plus cpuUsage?: number; memoryUsage?: number; throttled?: boolean; lastTermination?: 'OOMKilled' | 'Error' | 'Evicted' | 'Liveness'
export interface HorizontalPodAutoscaler { kind: 'HorizontalPodAutoscaler'; name: string; target: string; min: number; max: number; targetCpuPercent: number; desired?: number; note?: string }
export interface PodDisruptionBudget { kind: 'PodDisruptionBudget'; name: string; selector: Selector; minAvailable?: number; maxUnavailable?: number }
// Obj += both; Snapshot += hpas: HorizontalPodAutoscaler[]; pdbs: PodDisruptionBudget[]; load?: { rps: number; points: number[] }
// Scenario += load?: { target: string; points: [number, number][]; cpuPerRequest: number }; pool?: { cpu: number; memory: number; labels?: Labels; min: number; max: number };
//   schedulerStrategy?: 'LeastAllocated' | 'MostAllocated'; runToEnd?: boolean; nodes[] += labels?, taints?, memory?
// Action += cordon | uncordon | drain { node } ; taint { node; taint: Taint } ; apply object may be HorizontalPodAutoscaler | PodDisruptionBudget
// Fault += slow-start { prefix; seconds } ; hang { prefix; at } ; leak { prefix; miPerS }
// TraceKind += 'filter' | 'metrics' | 'throttle' | 'oom-kill' | 'evict' | 'evict-refused' | 'probe-fail' | 'hpa' | 'node-add' | 'node-remove' | 'cordon' | 'taint'
export function cpuRequestM(p: Pick<Pod, 'cpu' | 'resources'>): number;          // resources.cpu.request ?? cpu * 1000
export function memoryRequestMi(p: Pick<Pod, 'resources'>): number;               // ?? 0
export function qosOf(r: Resources | undefined): 'BestEffort' | 'Burstable' | 'Guaranteed';
export function tolerates(tolerations: Toleration[] | undefined, taint: Taint): boolean;
export function loadAt(points: [number, number][], t: number): number;           // linear, constant outside
```

- [ ] Tests (`model.test.ts`): `qosOf` (none → BestEffort; requests only → Burstable; cpu+memory with limit = request → Guaranteed); `tolerates` (Exists matches any value; Equal needs value; effect must match when set); `loadAt` (`[[0,20],[30,120]]` at 15 → 70, at 60 → 120, at −1 → 20); `cpuRequestM` (cores fallback).
- [ ] Run → FAIL; implement; full checks → PASS (phase 1 untouched); commit `Kubernetes engine: phase 2 model`.

### Task 2: Scheduler v2

**Files:** Modify `controllers/scheduler.ts`; tests in `controllers/scheduler.test.ts`; update the two phase 1 reason assertions in `controllers/controllers.test.ts`.

**Produces:** `schedule: Reconcile` (same export). The `bind` event gains `breakdown: Breakdown` and the `unschedulable` event `breakdown` too, where `Breakdown = { pod: string; rows: { node: string; filtered?: string; scores?: Record<string, number>; total?: number; chosen?: boolean }[] }` (add `breakdown?: Breakdown` to `TraceEvent`). Strategy is read from `ctx.strategy` (add `strategy?: ...` to `Ctx`; sim passes `scenario.schedulerStrategy`).

Rules: filters in order NodeUnschedulable, TaintToleration (NoSchedule and NoExecute), NodeAffinity required, PodAntiAffinity required, NodeResourcesFit (cpu then memory). Not Ready / booting nodes are skipped silently (not counted in N). Scores 0–100: NodeResourcesFit LeastAllocated = mean over cpu, memory of `100 × free / capacity` after placing the pod (MostAllocated = 100 − that); NodeAffinity preferred = `100 × matched weights / total weights` (absent → 0); PodAntiAffinity preferred = `100 − 100 × matching pods in topology / (max over nodes, ≥ 1)`; TaintToleration = `100 − 50 × untolerated PreferNoSchedule taints` (≥ 0). Total = sum. Highest wins; ties lowest name. Reason: `0/N nodes are available: ` + reasons grouped with counts in filter order, joined by `, ` (e.g. `0/3 nodes are available: 1 node(s) were unschedulable, 2 Insufficient cpu`).

- [ ] Tests: each filter rejects with its reason; LeastAllocated vs MostAllocated pick opposite nodes; preferred node affinity breaks a tie; anti-affinity spreads replicas across hostnames and zones; grouped reason text; phase 1 cases still bind to the same nodes; breakdown has one row per Ready node with `chosen` on the winner.
- [ ] Run → FAIL; implement; full checks → PASS (phase 1 scenario tests unchanged); commit `Kubernetes engine: scheduler filters and scores`.

### Task 3: Eviction API, drain, cordon, taints and PDBs

**Files:** Create `src/kubernetes/evict.ts`; modify `sim.ts` (actions, retry timer `{ kind: 'evict-retry'; pod }`, `runToEnd`), `env.ts`. Test `evict.test.ts` + sim tests.

**Produces:** `allowedDisruptions(pdb, pods): number`; `evictionAllowed(store, pod): { ok: true } | { ok: false; reason: string }`; simulator handling of `cordon` / `uncordon` / `drain` / `taint` actions (events `cordon`, `taint`, `evict`, `evict-refused`), NoExecute eviction (immediate, or after `seconds` via a timer), and `runToEnd` (the run lasts until `until` even with only periodic work left; `cutOff` false).

- [ ] Tests: allowed disruptions for minAvailable / maxUnavailable; drain with no PDB evicts every pod on the node at once; with minAvailable 3 of 4 evicts one, refuses the other with the Kubernetes message, retries every 5 s and succeeds once a replacement is ready; minAvailable 4 refuses forever and the run ends at `until` with a summary; NoExecute taint evicts untolerated pods at once and tolerated-with-seconds ones after the delay; cordoned node gets no new pods; uncordon restores.
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: eviction API, drain, taints and PDBs`.

### Task 4: Metrics, limits, QoS, OOMKill and node pressure

**Files:** Create `src/kubernetes/metrics.ts`; modify `sim.ts` (periodic `metrics` item every 5 s when the scenario has a `load` or any `leak`), `kubelet.ts` (expose `kill(pod, reason, exitCode)` reusing the exit/back-off path). Test `metrics.test.ts` + sim tests.

**Produces:** `metricsTick(env): void`: per pod `cpuUsage = min(share × cpuPerRequest, limit ?? ∞)` with share = `loadAt(t) / ready target pods`, `throttled` when capped; `memoryUsage = 64 + leak × seconds since start`; above the memory limit → kubelet kill with `OOMKilled` (exit 137, event `oom-kill`); node pressure → evict one pod per tick in order BestEffort, Burstable over request (highest use first), Guaranteed (event `evict`, `lastTermination: 'Evicted'`, pod deleted). Usage writes don't trigger watches; one `metrics` frame per tick narrates the load target's average CPU ("web: 3 pods at 72% of request, 120 req/s"); a `throttle` event when a pod becomes throttled. Snapshot `load` gets current rps and the points so far.

- [ ] Tests: share splits evenly over ready pods; throttle caps at the limit and sets the flag; memory leak hits the limit → `oom-kill`, restart with back-off, `lastTermination: 'OOMKilled'`; node pressure evicts the BestEffort pod before Burstable and Guaranteed; no load and no leak → no metrics items (phase 1 runs identical).
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: metrics, limits and OOMKill`.

### Task 5: Probes

**Files:** Create `src/kubernetes/probes.ts`; modify `kubelet.ts` (start probes on `start`/`restart`; readiness replaces the fixed READY_S only when a readiness probe exists). Test `probes.test.ts`.

**Produces:** per-pod probe timers (kind `probe`, carrying the kubelet generation, periodic so they don't keep a run alive). App health: starting until `slow-start` seconds after start (default 0), hung from `hang.at`. Startup probe: fails while starting; on success enables the others; after `failureThreshold` failures → restart (`lastTermination: 'Liveness'`). Liveness: fails while starting (when there's no startup probe) or hung; threshold → restart via the kubelet's exit path (`probe-fail` events, restart text "Liveness probe failed"). Readiness: success → ready; threshold failures → not ready.

- [ ] Tests: no probes → phase 1 timing; slow start with liveness only → restarted before it ever answers (restart loop); slow start with startup → no liveness restart before startup succeeds, then ready; hang with liveness → restart after 3 × 2 s; hang with readiness only → not ready, never restarted; a timer from before a restart does nothing.
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: probes`.

### Task 6: Horizontal Pod Autoscaler

**Files:** Create `controllers/hpa.ts`; modify `sim.ts` (periodic `hpa` item every 5 s when an HPA exists). Test `controllers/hpa.test.ts`.

**Produces:** `reconcileHpas(ctx, history: Map<string, { t: number; desired: number }[]>): Change[]`: ratio = avg cpuUsage / avg cpu request / (target / 100); |ratio − 1| ≤ 0.1 → hold; desired = clamp(ceil(current × ratio), min, max); scale-down uses the max desired within the last 30 s; writes the Deployment's replicas (event `hpa`, e.g. "HPA web: CPU 96% of request vs target 50% → 6 replicas"); updates the HPA object's `desired` and `note`; no CPU request → note "missing request for cpu", once.

- [ ] Tests: formula and clamp; tolerance holds; scale-down waits 30 s; flapping load doesn't flap replicas; missing request → no scaling; max reached noted.
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: Horizontal Pod Autoscaler`.

### Task 7: Cluster Autoscaler

**Files:** Create `controllers/autoscaler.ts`; modify `sim.ts` (periodic `autoscaler` item when `scenario.pool`; pool nodes `pool-1…` created at start up to `min`; boot timer). Test `controllers/autoscaler.test.ts`.

**Produces:** scale-up: a Pending pod whose reason is resources only and which fits an empty pool node, pool below max → add `pool-N` with `booting: true` (event `node-add`), Ready after 20 s (writes `booting: false`, wakes the scheduler); one node per scan; pending pods get `badge: 'waiting for a node'` in the view while one boots. At max → note "max node group size reached" once. Scale-down: pool node under 50% requested CPU for 60 s, pods fit elsewhere, above min → drain via `evict.ts` then delete (`node-remove`).

- [ ] Tests: 10 × 1-CPU pods on a 1-node pool of 4 CPU (max 4) → nodes added one per scan, all bound; max 2 → 2 pods stay Pending with the note; pod bigger than a pool node → no node added; scale back to 2 → idle nodes removed after 60 s, never below min.
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: Cluster Autoscaler`.

### Task 8: View, steps and renderer

**Files:** Modify `src/types/visualization.ts`, `roles.ts` (+ test), `view.ts`, `steps.ts` (+ tests), `ClusterRenderer.tsx`.

**Produces:** `ClusterView` optional fields from spec section 3 (`labels`, `taints`, `cordoned`, `booting`, `memory` on nodes; `cpu`, `qos`, `note` on pods; `pending[].badge`; HPA and PDB object rows; `traffic`; `scoring` from the event's `breakdown`). Steps: merge key = kind + actor + second + owner (subjects[1] for pod events, node for node events); `WHY` entries for every new trace kind; back-off text "up to 160 s here; 5 minutes by default". Renderer: `TrafficStrip` (inline SVG sparkline + "120 req/s"), `ScoringTable`, node badges and memory bar, pod CPU bar and notes.

- [ ] Tests: merge key keeps two ReplicaSets' creates apart; scoring view rows from a bind; HPA/PDB rows; traffic present only with load; `rolesInView` covers scoring rows.
- [ ] Run → FAIL; implement; full checks → PASS; browser check with a scratch scenario in the first lesson task; commit `Kubernetes view: phase 2 parts`.

### Tasks 9–16: the eight lessons

Same shape as phase 1 (scenario module + test, lesson content, meta entry with `difficulty: 'intermediate'`, `group: 'Scheduling & Health'`, prerequisites chaining from `services-kube-proxy`; `EXPECTED_IDS`, the Kubernetes count and contract `RANGES` updated). Knobs, presets and teaching moments are the spec's section 4 table; each scenario test pins every preset's teaching moment listed there, plus `refuses out-of-range values`. Order: 9 `scheduler`, 10 `requests-limits`, 11 `probes`, 12 `taints-tolerations`, 13 `affinity`, 14 `hpa`, 15 `cluster-autoscaler`, 16 `draining-pdb`. Each: test → FAIL → implement → full checks → browser check (desktop + 375 px, light + dark) → commit `Kubernetes lesson: <Title>`.

### Task 17: Minors, docs and final verification

- [ ] Check the node grace-period default against current Kubernetes docs (Context7); correct "40 s by default" in lessons and `steps.ts` if it changed.
- [ ] Contract test: garbage input yields exactly one step.
- [ ] README (lesson count 124, Kubernetes 15 of 23, new engine parts) and CLAUDE.md (phase 2 modules).
- [ ] `npm run lint && npm test && npm run build:pages && npm run check:bundle` → green, note first-load size; browser: catalog 15 live + 8 Coming soon.
- [ ] Commit `Docs: Kubernetes phase 2`; final whole-branch review; fixes; then ask about push/PR.
