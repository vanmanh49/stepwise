# Kubernetes track, phase 2: scheduling & health

Date: 2026-10-24
Status: approved design, awaiting spec review

## Goal

Make the 8 **Scheduling & Health** topics live: the scheduler's filters and scores, requests and limits, probes, taints and tolerations, affinity, the Horizontal Pod Autoscaler, the Cluster Autoscaler, and draining with PodDisruptionBudgets. Phase 2 extends the phase 1 simulator (`src/kubernetes/`) and `cluster` view; the event loop, the store and the `form` input stay as they are.

## Decisions

- **Load is a traffic curve.** A scenario can carry a request-rate curve over time aimed at a Deployment. Each ready pod's CPU use is its share of the traffic times a CPU cost per request. Scaling out spreads the load, so per-pod use falls and the HPA can settle.
- **Extend, don't fork.** New fields on nodes, pod templates and the scenario are optional. Leaving them out keeps phase 1 behaviour exactly, and every phase 1 test and lesson must pass unchanged.
- **Real names, shortened timings.** Object kinds, fields, statuses and messages follow Kubernetes (`OOMKilled`, `Insufficient cpu`, "would violate the pod's disruption budget"). Timings are shortened and each lesson says so.
- **No node "Ready again".** Draining and uncordoning only flip `unschedulable`; phase 2 needs no node to return from NotReady.
- One spec, one plan, one PR on branch `kubernetes-phase-2`, in the `stepwise` folder. Ask before merging.

## 1. Model additions (`model.ts`)

### Nodes

`NodeObj` gains:

- `labels: Labels` (for example `zone: a`, `disk: ssd`); `kubernetes.io/hostname` is implied by the node name.
- `taints: Taint[]`, where `Taint = { key: string; value: string; effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute' }`.
- `unschedulable: boolean` (cordoned).
- `memory: number` (MiB capacity).
- `booting?: boolean` while a node the autoscaler added is starting.

`Scenario.nodes[]` entries accept the same optional fields. Defaults: no labels, no taints, schedulable, 8192 MiB.

### Pod template and pods

`Template` (and so `Pod`) gains, all optional:

- `resources: { cpu?: { request?: number; limit?: number }; memory?: { request?: number; limit?: number } }` in millicores and MiB. Phase 1's `cpu` (cores) stays as the request when `resources` is absent.
- `tolerations: { key: string; operator: 'Equal' | 'Exists'; value?: string; effect?: Taint['effect']; seconds?: number }[]`.
- `affinity: { node?: { required?: Selector; preferred?: { weight: number; selector: Selector }[] }; podAnti?: { required?: AntiTerm; preferred?: { weight: number; term: AntiTerm }[] } }`, with `AntiTerm = { selector: Selector; topologyKey: 'kubernetes.io/hostname' | 'zone' }`.
- `probes: { liveness?: Probe; readiness?: Probe; startup?: Probe }`, with `Probe = { periodS: number; failureThreshold: number; initialDelayS?: number }`.

Pods gain status fields: `cpuUsage` (millicores), `memoryUsage` (MiB), `throttled: boolean`, `qos: 'BestEffort' | 'Burstable' | 'Guaranteed'` (derived from resources the way Kubernetes derives it), and `lastTermination?: 'OOMKilled' | 'Error' | 'Evicted' | 'Liveness'`.

### New objects

- `HorizontalPodAutoscaler { name; target: string /* Deployment */; min; max; targetCpuPercent }`.
- `PodDisruptionBudget { name; selector; minAvailable?: number; maxUnavailable?: number }` (exactly one of the two).

### Scenario

- `load?: { target: string; points: [t: number, rps: number][]; cpuPerRequest: number /* millicores */ }`, interpolated linearly between points and constant after the last.
- `pool?: { template: { cpu: number; memory: number; labels?: Labels }; min: number; max: number }` for the Cluster Autoscaler; pool nodes are named `pool-1`, `pool-2`, ….

### Actions and faults

- New actions: `cordon <node>`, `uncordon <node>`, `drain <node>`, `taint <node> <Taint>`, plus `apply` of the two new kinds.
- New faults: `slow-start <prefix> <s>` (the app answers probes only after s seconds), `hang <prefix> at t` (liveness fails from t), `leak <prefix> <MiB/s>` (memory grows while the container runs).

### Timings (seconds; Kubernetes default in brackets)

Metrics every 5 (≈15) · HPA sync 5 (15) · HPA scale-down stabilisation 30 (300) · HPA tolerance 10% (10%) · autoscaler scan 5 (10) · node boot 20 (1–2 minutes) · autoscaler scale-down after 60 unneeded (600) at < 50% requested (50%) · eviction retry 5 · default probe period 2 (10), failure threshold 3 (3).

## 2. Behaviour

### Scheduler v2 (`controllers/scheduler.ts`)

Replaces the phase 1 rule with filter → score, keeping its results for the view.

- **Filters**, in this order, each with the reason Kubernetes would give: `NodeUnschedulable` ("node(s) were unschedulable"), `TaintToleration` ("node(s) had untolerated taint {gpu: true}"), `NodeAffinity` required ("node(s) didn't match Pod's node affinity/selector"), `PodAntiAffinity` required ("node(s) didn't match pod anti-affinity rules"), `NodeResourcesFit` ("Insufficient cpu" / "Insufficient memory"). Not Ready and booting nodes are skipped as in phase 1.
- **Scores** (0–100 each, weighted sum): `NodeResourcesFit` with strategy `LeastAllocated` (default, prefers free nodes) or `MostAllocated` (bin-packing), `NodeAffinity` preferred (sum of matching weights, scaled), `PodAntiAffinity` preferred (fewer matching pods in the topology scores higher), `TaintToleration` (fewer PreferNoSchedule taints scores higher). Highest total wins; ties go to the lowest name.
- No node passes → Pending with `0/N nodes are available: <count> <reason>, …` (reasons grouped and counted, as Kubernetes prints them).
- A scenario-level `schedulerStrategy?: 'LeastAllocated' | 'MostAllocated'`.
- The `bind` event carries the per-node breakdown for the view.

### Metrics, limits and QoS (`metrics.ts`)

- Every metrics tick, for the `load` target: rps(t) is split evenly over its ready pods; `cpuUsage = share × cpuPerRequest`, capped at the CPU limit (then `throttled = true`). Pods outside the target idle at 0.
- Memory: a base of 64 MiB, plus `leak × seconds running`. Above the memory limit → the container is killed (`exit`, reason `OOMKilled`, exit code 137) and restarted by its restart policy with back-off.
- Node memory pressure: when the summed memory use on a node exceeds its capacity, the kubelet evicts one pod per tick: BestEffort first, then Burstable pods using more than their request, highest use first; Guaranteed last (`lastTermination: 'Evicted'`). Evicted pods are deleted, so their ReplicaSet replaces them.

### Probes (`probes.ts`)

- Configured probes run on their period after their initial delay. The startup probe holds the others off until it succeeds; it fails while the app is still in its `slow-start`.
- Liveness fails while the app is starting (if there's no startup probe) or after `hang`. After `failureThreshold` failures in a row the kubelet restarts the container (`lastTermination: 'Liveness'`, back-off as in phase 1).
- Readiness sets `ready` on success and clears it after `failureThreshold` failures; Endpoints follow as in phase 1.
- No readiness probe: phase 1 behaviour (ready 2 s after start).

### Horizontal Pod Autoscaler (`controllers/hpa.ts`)

Every sync: `ratio = average cpuUsage ÷ cpu request ÷ targetCpuPercent`; within 10% of 1 → no change; otherwise `desired = ceil(current × ratio)`, clamped to [min, max]. Scale-down uses the highest desired value seen in the last 30 s (stabilisation). Writes the Deployment's `replicas`. Pods without a CPU request make the HPA report "missing request for cpu" and do nothing.

### Cluster Autoscaler (`controllers/autoscaler.ts`)

- Scale-up: if a Pending pod is unschedulable only for resources and would fit an empty pool node, and the pool is below max, add one node (`booting`, Ready after 20 s). At most one node per scan.
- Scale-down: a pool node whose requested CPU is under 50% for 60 s in a row, whose pods could all fit elsewhere, and whose removal keeps the pool at or above min, is drained through the eviction API (PDBs respected) and then deleted.
- At max with pods still Pending, it records "max node group size reached" once.

### Eviction API, drain and PDBs (`evict.ts`)

- `drain <node>`: cordon it, then request an eviction for each pod on it (name order).
- An eviction is allowed when, for every PDB whose selector matches the pod, ready matching pods − 1 ≥ minAvailable (or unavailable + 1 ≤ maxUnavailable). Otherwise it is refused with "Cannot evict pod as it would violate the pod's disruption budget" and retried every 5 s.
- `NoExecute` taint: pods without a matching toleration are evicted at once (not through PDBs, as in Kubernetes); with `seconds`, after that delay.
- `cordon` / `uncordon` set `unschedulable`.

### Merged steps

Same-second events merge only when they share kind, actor **and owning object** (the ReplicaSet for pod events, the node for node events), so two ReplicaSets or nodes acting at once get their own steps.

## 3. The `cluster` view

`ClusterView` gains optional fields only:

- Nodes: `labels?: string[]`, `taints?: string[]` (shown as badges), `cordoned?: boolean`, `booting?: boolean`, `memory?: { used; capacity }`.
- Pods: `cpu?: { used; request?; limit? }` (a small bar), `qos?`, `note?` (`throttled`, `OOMKilled`, `Evicted`, `Liveness probe failed`).
- `pending[].badge`: "waiting for a node" while the autoscaler is booting one.
- `objects` rows for `HorizontalPodAutoscaler` (desired = desired replicas, current, note `CPU 72% / 50%`) and `PodDisruptionBudget` (note `allowed disruptions: 1`).
- `traffic?: { rps: number; points: number[] }`: the current req/s and the curve so far, drawn as a small inline sparkline.
- `scoring?: { pod: string; rows: { node: string; filtered?: string; scores?: Record<string, number>; total?: number; chosen?: boolean }[] }` for scheduler steps, drawn as a table.

`rolesInView` covers the new role-carrying parts. The renderer stays plain HTML; new parts are small components in `ClusterRenderer.tsx` (or a sibling file if it grows past ~300 lines).

## 4. Lessons (Scheduling & Health, intermediate)

| id | What the learner watches | Knobs | Presets |
|---|---|---|---|
| `scheduler` | One pod placed on 3 nodes with different free CPU and memory; the scoring table shows each node's filters and scores, and the winner. | strategy LeastAllocated / MostAllocated · pod CPU 1–4 · cordon node-2 off / on | Spread (least allocated) · Bin-pack (most allocated) · Nothing fits |
| `requests-limits` | A Deployment under a traffic ramp: CPU over the limit is throttled, not killed; a memory leak past the limit is OOMKilled and restarts; on a node out of memory, BestEffort goes first. | QoS BestEffort / Burstable / Guaranteed · CPU limit none / 500m / 1000m · memory leak off / on | Throttled, not killed · OOMKilled · Node pressure evicts BestEffort first |
| `probes` | A Service with steady requests and an app that starts slowly (20 s) and hangs at 40 s; requests show who gets traffic. | liveness / readiness / startup (each off / on) · slow start off / on · hang off / on | No probes: a hung pod keeps traffic · Liveness restarts the hung pod · Liveness kills a slow starter · Startup probe protects a slow start |
| `taints-tolerations` | node-3 tainted `gpu=true:NoSchedule`; pods with and without a toleration; a `NoExecute` taint at 20 s evicts untolerated pods, after `tolerationSeconds` if set. | toleration off / on · effect NoSchedule / NoExecute · tolerationSeconds none / 10 | Tainted node is skipped · A toleration allows but doesn't force · NoExecute evicts · tolerationSeconds delays it |
| `affinity` | 4 nodes in zones a and b labelled `disk=ssd/hdd`; required and preferred node affinity; pod anti-affinity by hostname spreading replicas. | node affinity none / required ssd / preferred ssd · anti-affinity none / preferred / required · replicas 2–6 | Required ssd · Preferred falls back when ssd is full · Spread one per node · Too many replicas stay Pending |
| `hpa` | A Deployment plus an HPA (min 2, target 50% CPU) under a traffic curve: up quickly, down after the stabilisation window. | curve spike / ramp / flapping · max replicas 4–8 · target 30 / 50 / 80% | A spike scales up, then down · Hits max replicas · Flapping load is smoothed |
| `cluster-autoscaler` | A pool (min 1, max 4, 4 CPU each): scaling to 10 replicas leaves pods Pending, new nodes boot and take them; scaling back to 2 empties nodes, which go after 60 s. | target replicas 2–14 · pool max 2–4 · scale back at 80 s off / on | Scale up for Pending pods · Hits max nodes · Scale down idle nodes |
| `draining-pdb` | 4 replicas on 3 nodes (node-1 holds 2) behind a Service with requests; `kubectl drain node-1` cordons it and evicts both pods; the PDB decides how many can go at once. | PDB none / minAvailable 3 / maxUnavailable 1 / minAvailable 4 · uncordon at 60 s off / on | Drain without a PDB (ready drops to 2) · Drain with minAvailable 3 (never below 3 ready) · PDB blocks the drain |

Every lesson has the same content sections as phase 1 (overview, concept, howItWorks, pseudocode, prosCons, applications, commonMistakes, a quiz of 4–5 questions with at least one `view`, summary) and calls out each shortened timing.

## 5. Phase 1 deferred minors folded in

- Merged steps key on the owning object (section 2).
- `pending[].badge` is used (section 3).
- The node grace-period default is checked against current Kubernetes documentation and the lessons' "40 s by default" corrected if it changed.
- The back-off text gives the real defaults: cap 5 minutes, reset after 10 minutes.
- The contract test asserts exactly one step for garbage input.

Still deferred: a ReplicaSet restored by rollback keeps its old revision (no phase 2 lesson rolls back).

## 6. Testing

- **Unit:** each scheduler filter and score (weights, ties, grouped "0/N nodes are available" reason); QoS derivation; metrics share × cost and the throttle cap; OOMKill at the memory limit; node-pressure eviction order; probes (startup holds off liveness, liveness restarts after the threshold, readiness toggles ready); HPA formula, tolerance, clamp and stabilisation; autoscaler scale-up only for resource-unschedulable pods that fit a pool node, one node per scan, boot delay, scale-down timing and min size; eviction refused by a PDB and allowed once replacements are ready; NoExecute with and without `seconds`.
- **Simulator:** same scenario → same frames with every new controller active; phase 1's `sim.test.ts` and every phase 1 scenario test pass unchanged.
- **Scenario tests per lesson:** each preset's teaching moment, for example "minAvailable 3: ready pods never fall below 3 in any frame", "no PDB: ready pods drop to 2 during the drain", "the HPA never exceeds max", "startup probe: no liveness restart before startup succeeds".
- **Contract:** the 8 lessons join `contract.test.ts`, which also asserts exactly one step for garbage input; new number fields get `RANGES`.
- **CI gates:** `npm run lint`, `npm test`, `npm run build:pages`, `npm run check:bundle` (600 kB first load; phase 1 left it at 553.9 kB).
- **Manual:** every preset in light and dark mode, at desktop and 375 px.

## Out of scope (phase 2)

DaemonSets ignored by drain (phase 3 adds DaemonSets), vertical pod autoscaling, custom HPA metrics, topology spread constraints, pod priority and preemption, nodes returning from NotReady.
