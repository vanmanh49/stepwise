# Kubernetes Track, Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the last 8 Kubernetes lessons live (Workloads & Operations), finishing the track at 23 of 23, by extending the simulator with config, storage, StatefulSets, DaemonSets, Jobs and CronJobs, Ingress, NetworkPolicies and an operator.

**Architecture:** Everything extends `src/kubernetes/`. Optional model fields leave earlier behaviour unchanged when absent. New pure controllers (`controllers/volumes.ts`, `statefulset.ts`, `daemonset.ts`, `job.ts`, `cronjob.ts`, `operator.ts`) join the simulator's watch groups. New per-run modules (`config.ts`, `storage.ts`) and pure routing helpers (`ingress.ts`, `network.ts`) are called from `kubelet.ts` and `sim.ts`'s `route`. `ClusterView` gains optional parts, and one new `RuleTable` component draws them.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite, Vitest, Tailwind, Oxlint.

**Spec:** `docs/superpowers/specs/2026-10-24-kubernetes-track-phase-3-design.md`

## Global Constraints

- Branch `kubernetes-phase-3` in the `stepwise` folder (exists, from `main` at e80ab8d). No worktrees.
- Every phase 1–2 test passes unchanged. New model fields are optional; absent fields give phase 1–2 behaviour.
- Timings (s): config sync 10 · data tick 5 (+5 records per tick per mount) · provisioning 3 · attach 2 · Multi-Attach retry 5 · Job pod back-off 10 doubling (reuse `backoffS`) · CronJob check 10 · operator backup Job runs 20.
- Pods carry `ownerKind`; absent = `'ReplicaSet'`. The ReplicaSet controller and `view.ts`'s `podsOf` only count pods whose `ownerKind ?? 'ReplicaSet'` is `'ReplicaSet'`.
- Messages follow Kubernetes, verbatim:
  - `configmap "<name>" not found` / `secret "<name>" not found`, phase `CreateContainerConfigError`
  - `pod has unbound immediate PersistentVolumeClaims`
  - `Multi-Attach error for volume "<pv>": Volume is already used by pod(s) <pod>`
  - `BackoffLimitExceeded`, `DeadlineExceeded`
  - `Unsupported value: "Always": supported values: "OnFailure", "Never"`
  - `404 Not Found`, `503 Service Unavailable`
  - `no matches for kind "Database" in version "example.com/v1": ensure CRDs are installed first`
- Lessons: `difficulty: 'advanced'`, `group: 'Workloads & Operations'`, prerequisites chaining from `draining-pdb`, `codeLabel: 'Pseudocode'`, no `complexity`, quiz 4–5 questions of ≥ 3 types with ≥ 1 `view`, shortened timings called out in the text.
- No AI attribution in commits or PRs. Every task ends green on `npm run typecheck && npm run lint && npm test`; commit only after that passes.

## Review Focus

- **A StatefulSet whose pod never gets ready** (OrderedReady): higher ordinals are never created, and the run still ends with a summary instead of hanging. Pinned in Task 4.
- **A Job with parallelism above the work left**: active pods never exceed `completions − succeeded`, and `succeeded` never passes `completions`. Pinned in Task 6.
- **A CronJob whose runs outlast the schedule under Forbid**, over the whole 600 s: never two active Jobs, each skip narrated once, and history pruning leaves no orphan pods. Pinned in Task 6.
- **Deleting a PVC a running pod still uses**: it is only marked `deleting`, its PV keeps its data, and it goes once the pod is gone. A stale attach timer for a deleted pod does nothing. Pinned in Task 3.
- **Empty selectors in NetworkPolicies**: `podSelector: []` selects every pod, and `from: [[]]` allows every pod. A request whose `from` pod isn't Running fails with a clear reason instead of throwing. Pinned in Task 8.

---

## File map

| File | Responsibility |
|---|---|
| `src/kubernetes/model.ts`, `store.ts` | new kinds, fields, timings, trace kinds; store validation and snapshot |
| `src/kubernetes/config.ts` | resolve env / ConfigMap volumes, config sync |
| `src/kubernetes/controllers/volumes.ts`, `storage.ts` | PV binding, provisioning, reclaim; attach/detach; data tick |
| `src/kubernetes/controllers/statefulset.ts` | StatefulSet |
| `src/kubernetes/controllers/daemonset.ts` | DaemonSet |
| `src/kubernetes/controllers/job.ts`, `cronjob.ts` | Job, CronJob |
| `src/kubernetes/ingress.ts`, `network.ts` | Ingress matching, NetworkPolicy checks (pure) |
| `src/kubernetes/controllers/operator.ts` | the `Database` operator |
| `src/kubernetes/sim.ts`, `kubelet.ts`, `scheduler.ts`, `nodes.ts`, `evict.ts`, `env.ts` | wiring |
| `src/kubernetes/view.ts`, `steps.ts`, `src/types/visualization.ts`, `roles.ts`, `ClusterRenderer.tsx`, new `RuleTable.tsx` | view and narration |
| `src/kubernetes/scenarios/<id>.ts`, `src/lessons/kubernetes/<id>.ts`, `lessons/meta/kubernetes.ts` | the 8 lessons |

---

### Task 1: Model, store and actions

**Files:** Modify `model.ts`, `store.ts`, `sim.ts` (new actions), `controllers/replicaset.ts` and `view.ts` (`ownerKind` filter), `controllers/scheduler.ts` (implied hostname label). Test: `model.test.ts`, `store.test.ts`, `sim.test.ts`.

**Produces:**

```ts
export const CONFIG_SYNC_S = 10, DATA_S = 5, RECORDS_PER_TICK = 5, PROVISION_S = 3, ATTACH_S = 2, ATTACH_RETRY_S = 5, CRON_CHECK_S = 10, BACKUP_RUN_S = 20;
export type OwnerKind = 'ReplicaSet' | 'StatefulSet' | 'DaemonSet' | 'Job';
export type Volume = { name: string; emptyDir: true } | { name: string; claim: string } | { name: string; configMap: string };
export interface EnvVar { name: string; from: { configMap: string; key: string } | { secret: string; key: string } }
// Template += env?: EnvVar[]; volumes?: Volume[]; run?: { seconds: number; exitCode: 0 | 1; failFirst?: number }; annotations?: Labels
// Pod += ownerKind?: OwnerKind; config?: Record<string, string>; records?: number;  PodPhase += 'CreateContainerConfigError'
// New kinds (fields exactly as spec §1): ConfigMap, Secret, StorageClass, PersistentVolume, PersistentVolumeClaim, StatefulSet,
//   DaemonSet, Job, CronJob, Ingress, NetworkPolicy, CustomResourceDefinition, Database. Obj, Snapshot (one list per kind) and
//   the apply action's object union include them all.
// Component += 'operator'. Scenario += ingressController?: boolean.
// Action += { kind: 'rollout-restart'; target } | { kind: 'delete'; object: { kind: Kind; name: string } } | { kind: 'add-node'; node: Scenario['nodes'][number] }
//   | { kind: 'edit-config'; name: string; key: string; value: string };  request += from?: string; host?: string; path?: string
// RequestState += from?: string; host?: string; path?: string; body?: string
// TraceKind += 'config' | 'config-error' | 'bind-volume' | 'provision' | 'attach' | 'attach-fail' | 'reclaim' | 'job' | 'cron'
//   | 'ingress' | 'policy-drop' | 'operator' | 'node-join' | 'records'
export const nodeLabels = (n: NodeObj): Labels => ({ 'kubernetes.io/hostname': n.name, ...n.labels });
```

Store refusals: a `Job` (or a CronJob's `jobTemplate`) with `restartPolicy: 'Always'`; a `Database` with no `CustomResourceDefinition` stored. Both use the Global Constraints messages. `rollout-restart` writes `template.annotations.restartedAt = String(now)` and pushes the old template to history, like `withImage`. `delete` deletes any stored object, and a missing one is narrated as not found. `add-node` creates a Ready node and narrates it as `node-join`.

- [ ] Tests: the store refuses both, with the exact messages, and accepts a Database once its CRD exists. `rollout-restart` makes the Deployment create a new ReplicaSet. `add-node` gives the scheduler a new node. A Job-owned pod named like a ReplicaSet's is not counted by that ReplicaSet. The scheduler matches `kubernetes.io/hostname` in required node affinity. Every phase 1–2 test is unchanged.
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: phase 3 model`.

### Task 2: ConfigMaps and Secrets

**Files:** Create `config.ts`; modify `kubelet.ts` (resolve at start, `CreateContainerConfigError` with retry on sync), `sim.ts` (periodic `config-sync` item when any template has `env` or a configMap volume; `edit-config` action; `route` fills `body`). Test `config.test.ts`.

**Produces:** `resolveConfig(store, pod): { ok: true; env: Record<string, string>; mounted: Record<string, string> } | { ok: false; reason: string }`. The pod's `config` is `{ ...env, ...mounted }` at start. `configSync(env)`: for each Running pod with a configMap volume, re-reads the mounted keys and writes `config` when they changed (event `config`, e.g. "kubelet refreshes web-x9k's mounted web-config: color=green"). Pods in `CreateContainerConfigError` retry the resolve, then continue to pull/start. `route` sets `body = Object.entries(pod.config).map(([k, v]) => \`${k}=${v}\`).join(', ')` when the pod has config.

- [ ] Tests: env frozen at start (edit at 20 s; the pod still reports blue at 60 s). Volume refreshed on the first sync after the edit (≤ 10 s). A missing ConfigMap → `CreateContainerConfigError` with `configmap "web-config" not found`, then Running within one sync of the ConfigMap being created. A missing Secret key → the error names the secret. `rollout-restart` → the new pods report green. No config fields → no sync items (phase 1–2 frames identical).
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: ConfigMaps and Secrets`.

### Task 3: Volumes, PV and PVC

**Files:** Create `controllers/volumes.ts`, `storage.ts`; modify `sim.ts` (group `volumes` watching PVC, PV, Pod, StorageClass; periodic `data` item when any template has volumes; `provision` timer), `scheduler.ts` (`VolumeBinding` filter before `NodeResourcesFit`), `kubelet.ts` (attach before pull; `attach` timer kind with generation check), `env.ts` (timer kinds `provision`, `attach`). Test `controllers/volumes.test.ts`, `storage.test.ts`.

**Produces:** `reconcileVolumes: Reconcile`. It binds Pending PVCs (smallest fit, ties to lowest name) and requests provisioning (`provision` timer → creates PV `pvc-<claim>` with the class's reclaimPolicy and binds it). It applies reclaim for deleted claims (PV `Delete` → deleted, records gone; `Retain` → `Released`). It deletes `deleting` PVCs once no non-finished pod uses them. A `delete` action on a PVC in use sets `deleting: true` instead of deleting. `attachFor(store, pod): { ok: true } | { ok: false; reason: string }` holds the RWO rule; on success the kubelet writes `attachedTo = node`. `detachIdle(env)` runs on every Pod watch. `dataTick(env)`: +5 records per Running pod per mount (PV `records` or pod `records`), one `records` frame per tick naming the totals.

- [ ] Tests: binding picks the smallest fitting PV and respects class and mode. No PV and no class → PVC and pod stay Pending with the scheduler message. Provisioning binds after 3 s. Records survive a pod replacement on a PVC and reset on an emptyDir. Reclaim Delete vs Retain. In-use PVC deletion is deferred (Review Focus). A second replica on another node gets the Multi-Attach message and retries every 5 s. A stale attach timer for a deleted pod does nothing.
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: volumes, PV and PVC`.

### Task 4: StatefulSet

**Files:** Create `controllers/statefulset.ts`; modify `sim.ts` (group `statefulset` watching StatefulSet, Pod, PVC; `set-image` accepts a StatefulSet target), `steps.ts` `ownerOf`. Test `controllers/statefulset.test.ts`.

**Produces:** `reconcileStatefulSets: Reconcile` with the rules of spec §2. Pods are `<name>-<i>` (`ownerKind: 'StatefulSet'`, `volumes` with claim `<claim>-<name>-<i>`). PVCs are created with `owner: <name>`. OrderedReady changes at most one pod per pass. The rolling update goes from the highest ordinal down, one pod at a time (a pod is outdated when its template differs from the set's, compared as in `deployment.ts`'s `sameTemplate`). `whenScaled: 'Delete'` deletes a scaled-down pod's claims after the pod. Pods get `dns: '<pod>.<serviceName>'` in the view (Task 10).

- [ ] Tests: OrderedReady creates db-1 only after db-0 is ready; Parallel creates all 3 in one pass. Scale-down removes db-2 then db-1, never together, and keeps their PVCs. Scale-up reuses them, and the records come back. Deleting db-1 → a new db-1 with the same PVC. A rolling update replaces db-2, db-1, db-0 in that order. db-1 never ready → db-2 never created, and the run ends with a summary (Review Focus).
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: StatefulSet`.

### Task 5: DaemonSet

**Files:** Create `controllers/daemonset.ts`; modify `sim.ts` (group `daemonset` watching DaemonSet, Node, Pod; `set-image` accepts a DaemonSet), `scheduler.ts` (`NodeUnschedulable` passes pods tolerating `node.kubernetes.io/unschedulable`), `nodes.ts` (skip pods tolerating `node.kubernetes.io/not-ready`), `evict.ts` (drain skips `ownerKind: 'DaemonSet'`). Test `controllers/daemonset.test.ts`.

**Produces:** `reconcileDaemonSets: Reconcile`: eligible = Ready, matches `nodeSelector` on `nodeLabels`, NoSchedule/NoExecute taints tolerated by the template's own tolerations. It creates a pod (`podName`, `ownerKind: 'DaemonSet'`, required node affinity `kubernetes.io/hostname = <node>`, plus the automatic tolerations of spec §2) for each eligible node without one. It deletes pods on nodes no longer eligible. Rolling update: when no pod is updating, it deletes one outdated pod (node name order).

- [ ] Tests: one pod per eligible node and none on the tainted node without a toleration. `add-node` → a pod on node-4 within one watch. A nodeSelector limits nodes. A cordoned node still gets its pod. Drain evicts the other pods but leaves the DaemonSet pod. node-down doesn't mark the DaemonSet pod Lost. A rolling update has never more than one node without a ready agent.
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: DaemonSet`.

### Task 6: Jobs and CronJobs

**Files:** Create `controllers/job.ts`, `controllers/cronjob.ts`; modify `kubelet.ts` (`run`: exit timer after `seconds`, code 1 while the owner's failures < `failFirst`; per-owner failure count kept in the kubelet), `sim.ts` (group `job` watching Job, Pod; periodic `cron` item every 10 s when a CronJob exists; `job-retry` timer for back-off; `job-deadline` timer). Test `controllers/job.test.ts`, `controllers/cronjob.test.ts`.

**Produces:** `reconcileJobs(ctx, retryAt: Map<string, number>): Change[]`: counts succeeded and failed from its pods (`Completed` / `Failed`, plus `restarts` for OnFailure), updates `status`, and creates `min(parallelism, completions − succeeded − active)` pods once no back-off is pending. It sets the `Complete` / `Failed` condition and deletes active pods on failure. `cronTick(env, now)`: due times are `k × 60N`. One Job `<name>-<k×N>` is created per due time not yet scheduled (`lastScheduled`), with `owner: <cronjob>`. Forbid → `cron` event "skips the 3 min run: job-2 is still running". Replace → deletes the active Job and its pods first. Then it prunes finished Jobs beyond the history limits, oldest first, with their pods.

- [ ] Tests: completions 6, parallelism 3 → exactly 3 active, then the rest, and `succeeded` never above 6. Parallelism 3 with 1 left → 1 active (Review Focus). failFirst 2 with Never → 2 Failed pods, back-off 10 then 20 s, then Complete. Always failing with backoffLimit 2 → `Failed`/`BackoffLimitExceeded` after the 3rd failure. A 90 s run with a 60 s deadline → `DeadlineExceeded`, pod deleted. OnFailure counts restarts. CronJob `*/1`: Jobs at 0, 60, 120 … s. Allow with 90 s runs → two active at once. Forbid → never two, each skip narrated once. Replace → the old Job deleted at each schedule. History keeps 3 succeeded and 1 failed, with no orphan pods (Review Focus).
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: Jobs and CronJobs`.

### Task 7: Ingress

**Files:** Create `ingress.ts`; modify `sim.ts` (`route`: a request with `host`/`path` goes through the controller). Test `ingress.test.ts`, sim tests.

**Produces:** `matchIngress(ingresses: Ingress[], host: string, path: string): { service: string; rule: { ingress: string; host?: string; path: string; pathType: 'Prefix' | 'Exact' } | 'default' } | undefined` with spec §2's precedence. `route` uses the matched Service's Endpoints and the existing seeded pick. Events: `ingress` (`ingress-nginx sends GET shop.example.com/api/cart to api (Prefix /api)`), and `request-fail` with `404 Not Found`, `503 Service Unavailable` or `connection refused: no ingress controller is running`. The event carries the data for the `rules` table: each rule as cells `host · path · type · service`, with the matched one as `found` (add `rules?: ClusterView['rules']` to `TraceEvent`).

- [ ] Tests: `/api/cart` → api; `/apiary` → no `/api` match → `/` → web with Prefix `/`, or 404 without it; Exact `/api` doesn't match `/api/cart`; longest path wins; Exact beats Prefix at equal length; a host-less rule matches any host; unknown host → default backend or 404; 0 api replicas → 503; no controller → every ingress request fails.
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: Ingress`.

### Task 8: NetworkPolicy

**Files:** Create `network.ts`; modify `sim.ts` (`route` checks when `from` is set). Test `network.test.ts`.

**Produces:** `checkTraffic(policies: NetworkPolicy[], from: Pod, to: Pod): { ok: true } | { ok: false; stage: 'dns' | 'egress' | 'ingress'; policies: string[] }`, plus `policyRows(policies, pods, decided?)` for the `rules` table (cells `policy · selects · type · allows`). `route` with `from`: no Running source pod → `request-fail` "no running pod starting with <from> to send from". DNS stage → `DNS lookup for <service> timed out`. Egress or ingress stage → `policy-drop` event, request failed with `connection timed out`, narration naming the isolating policies.

- [ ] Tests: no policies → all allowed. A default deny (`podSelector: []`, Ingress, no rules) blocks every request. Allowing frontend→api doesn't allow debug→api. Two policies' rules add up. `from: [[]]` allows all pods. Egress isolation without `dns` fails at DNS, and with `dns: true` reaches the egress check. A missing source pod fails cleanly (Review Focus).
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: NetworkPolicies`.

### Task 9: CRDs and the operator

**Files:** Create `controllers/operator.ts`; modify `sim.ts` (group `operator`, component `operator`, watching Database, StatefulSet, Job, Pod; it runs only while a pod owned by Deployment `db-operator`'s ReplicaSets is Running and ready, and runs once when one becomes ready). Test `controllers/operator.test.ts`.

**Produces:** `reconcileDatabases: Reconcile` with spec §2's rules. Children are created with the Task 1–6 kinds: Secret `db-credentials` with `password`, a Service `db` selecting `app=db`, and a StatefulSet `db` (`postgres:<version>`, OrderedReady, claim `data` 1 Gi class `standard`). The backup Job `db-backup-<version>` uses `run: { seconds: 20, exitCode: 0 }`. Every write is narrated as `operator` ("db-operator: Database db wants 3 replicas, StatefulSet db has 1: sets it back to 3"). The Database `status` is written only when it changes.

- [ ] Tests: no CRD → the Database apply is refused and nothing is created. With the CRD → Secret, Service and StatefulSet appear and status goes Creating → Ready. A hand scale to 1 is set back to 3. Version 15 → 16 with backup → the Job completes before any pod gets the new image. Without backup → the image changes at once. Operator scaled to 0 during a replicas change → nothing changes until its pod is ready again, then one pass catches up.
- [ ] Run → FAIL; implement; full checks → PASS; commit `Kubernetes engine: CRDs and operator`.

### Task 10: View, steps, renderer and phase 2 minors

**Files:** Modify `src/types/visualization.ts`, `roles.ts` (+ test), `view.ts`, `steps.ts` (+ tests), `ClusterRenderer.tsx`; create `src/components/visualization/renderers/RuleTable.tsx`. Phase 2 minors: `controllers/autoscaler.ts`, `kubelet.ts`, `sim.ts` (`taint`), `metrics.ts`.

**Produces:**
- `ClusterView` optional parts from spec §3: pod `mounts`, `dns`; object rows for every new kind; request `label` (`GET <host><path>`, `<from> → <service>`, else `to <service>`) and `body`; `rules` (from the event's `rules`).
- `WHY` entries for every new trace kind; `ownerOf` covers StatefulSet, DaemonSet and Job pods.
- `RuleTable` renders a `title`, a header from `columns`, and role-coloured rows, in plain HTML like `ScoringTable`. Pod badges reuse the existing badge markup. `rolesInView` covers `rules` rows.
- Minors, per spec §5: the autoscaler's scale-down fits each pod on one other node; a failed startup probe is narrated "Startup probe failed"; `taint` replaces a same key and effect taint; a `memoryPressure` write goes through `apply` with a Node watch.

- [ ] Tests: Ingress and NetworkPolicy steps carry `rules` with one highlighted row. The PVC and Secret rows have the spec notes (Secret base64). Request labels for the three request shapes. `rolesInView` covers rules. Autoscaler: two half-full nodes with free CPU summing to a pod's request but neither alone → no scale-down. A duplicate taint is replaced. Startup wording.
- [ ] Run → FAIL; implement; full checks → PASS; browser check with a scratch scenario; commit `Kubernetes view: phase 3 parts`.

### Tasks 11–18: the eight lessons

These follow the phase 1–2 shape: a scenario module and its test, the lesson content, and a meta entry (`advanced`, `Workloads & Operations`, prerequisites chaining from `draining-pdb`). Each task also updates `EXPECTED_IDS`, the Kubernetes count in `lessons.test.ts` and the contract `RANGES`. Knobs, presets and teaching moments are the spec's section 4 table. Each scenario test pins every preset's teaching moment from that table, plus `refuses out-of-range values` (exactly one refusal step).

Order:
11. `configmaps-secrets`
12. `volumes-pv-pvc`
13. `statefulsets`
14. `daemonsets`
15. `jobs-cronjobs`
16. `ingress`
17. `network-policies`
18. `operators-crds`

Each lesson: test → FAIL → implement → full checks → browser check (desktop + 375 px, light + dark) → commit `Kubernetes lesson: <Title>`.

`RANGES` additions: `statefulsets: { replicas: [1, 5] }`, `'jobs-cronjobs': { completions: [1, 6], parallelism: [1, 3] }`, `ingress: { apiReplicas: [0, 2] }`.

### Task 19: Docs and final verification

- [ ] Re-check against kubernetes.io (Context7): the Ingress-frozen / Gateway API wording, and Job back-off cap "ten minutes". Correct the lesson text if either changed.
- [ ] README: lesson count 132, Kubernetes 23 of 23, new engine parts. CLAUDE.md: the Kubernetes bullet lists the phase 3 kinds and modules.
- [ ] `npm run lint && npm test && npm run build:pages && npm run check:bundle` → green, and note the first-load size (≤ 600 kB). Browser: the catalog shows 23 live Kubernetes lessons and no Coming soon.
- [ ] Commit `Docs: Kubernetes phase 3`. Then the final whole-branch review, then fixes, then ask about push/PR.
