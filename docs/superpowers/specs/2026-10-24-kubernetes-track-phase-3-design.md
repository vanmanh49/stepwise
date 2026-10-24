# Kubernetes track, phase 3: workloads & operations

Date: 2026-10-24
Status: draft design, awaiting the user's review

## Goal

Make the last 8 Kubernetes topics live: ConfigMaps & Secrets, Volumes/PV/PVC, StatefulSets, DaemonSets, Jobs & CronJobs, Ingress, Network Policies, and Operators & CRDs. This finishes the track (23 of 23 live). Phase 3 extends the simulator in `src/kubernetes/` and the `cluster` view. The event loop, the store, the `form` input and every phase 1–2 lesson stay as they are.

## Decisions

- **Extend, don't fork** (as in phase 2). New kinds and fields are optional. Leaving them out keeps phase 1–2 behaviour exactly, and every earlier test passes unchanged.
- **The app has visible state.** Two small, fake behaviours let the learner see what Kubernetes promises:
  - **Config:** a request answered by a pod returns the config value that pod is using (`color=blue`).
  - **Data:** a running pod with a volume writes 1 record per second to it, so the learner can see data survive (or vanish) when a pod is replaced.
- **Requests grow, routing stays one function.** The `request` action gains an optional source pod (`from`, for NetworkPolicies) and an optional `host` and `path` sent through an Ingress controller. kube-proxy's seeded endpoint pick is unchanged.
- **Real timings where they fit in 600 s.** Job back-off (10 s, doubling) and CronJob schedules (`*/1 * * * *` = every 60 s; the CronJob controller checks every 10 s) are real. The kubelet's config sync is shortened (10 s here; about a minute by default) and each lesson says so.
- **No namespaces.** NetworkPolicies use pod selectors only; `namespaceSelector` is explained in the text and the quiz. No finalizers and no `Terminating` pods (as decided in phase 1). A PVC that is in use gets a `deleting` flag instead (storage-object-in-use protection).
- **The operator runs as a pod.** It reconciles only while its own Deployment has a ready pod. Scaling that Deployment to 0 and back is how a lesson shows an operator outage, with no new fault kind.
- **Pods record their owner's kind** (`ownerKind`), so a Job, a StatefulSet and a ReplicaSet with the same name never take each other's pods. Absent means ReplicaSet, as in phase 1.
- Phase 2 deferred minors folded in: see section 5.
- One spec, one plan, one PR on branch `kubernetes-phase-3`, in the `stepwise` folder. Ask before merging.

## 1. Model additions (`model.ts`)

### New kinds

- `ConfigMap { name; data: Record<string, string> }`, `Secret { name; data: Record<string, string> }` (values stored as given; the view shows them base64-encoded and says base64 is not encryption).
- `StorageClass { name; reclaimPolicy: 'Delete' | 'Retain' }`: dynamic provisioning with `Immediate` binding.
- `PersistentVolume { name; capacityGi; accessMode: 'ReadWriteOnce' | 'ReadWriteMany'; storageClass?; reclaimPolicy; phase: 'Available' | 'Bound' | 'Released'; claim?; records: number; attachedTo?: string /* node */ }`.
- `PersistentVolumeClaim { name; requestGi; accessMode; storageClass?; phase: 'Pending' | 'Bound'; volume?; deleting?: boolean; owner?: string }`.
- `StatefulSet { name; replicas; selector; template; serviceName; podManagementPolicy: 'OrderedReady' | 'Parallel'; claims?: { name; requestGi; storageClass }[]; whenScaled: 'Retain' | 'Delete'; revision; history }`.
- `DaemonSet { name; selector; template; nodeSelector?: Labels; revision }`.
- `Job { name; template; completions; parallelism; backoffLimit; activeDeadlineS?; owner?; status: { active; succeeded; failed; startedAt; condition?: 'Complete' | 'Failed'; reason?: 'BackoffLimitExceeded' | 'DeadlineExceeded' } }`.
- `CronJob { name; schedule: string /* "*/N * * * *" */; jobTemplate: Omit<Job, 'kind' | 'name' | 'status' | 'owner'>; concurrencyPolicy: 'Allow' | 'Forbid' | 'Replace'; successfulHistory: number; failedHistory: number; lastScheduled?: number }`.
- `Ingress { name; rules: { host?: string; paths: { path: string; pathType: 'Prefix' | 'Exact'; service: string }[] }[]; defaultBackend?: string }`.
- `NetworkPolicy { name; podSelector: Selector /* [] = every pod */; policyTypes: ('Ingress' | 'Egress')[]; ingress?: { from: Selector[] }[]; egress?: { to: Selector[]; dns?: boolean }[] }`.
- `CustomResourceDefinition { name: 'databases.example.com'; group: 'example.com'; resource: 'Database' }` and `Database { name; spec: { replicas; version: number; backup: boolean }; status?: { phase: 'Creating' | 'Ready' | 'BackingUp' | 'Upgrading'; ready: number; version: number } }`. Only one custom kind exists: the lesson's example. The store treats `Database` as served only once its CRD exists.

### Template and pod fields (all optional)

- `env?: { name; from: { configMap | secret: string; key: string } }[]`: read once, when the container starts.
- `volumes?: ({ name; emptyDir: true } | { name; claim: string } | { name; configMap: string })[]`.
- `run?: { seconds: number; exitCode: 0 | 1; failFirst?: number }`: a container that finishes (Jobs). `failFirst` makes the owner's first n containers exit 1.
- `annotations?: Labels`: `kubectl rollout restart` writes `restartedAt` here, so the template changes and a rollout follows.
- Pod status: `ownerKind?`, `config?: Record<string, string>` (what the app reads now), `records?: number` (emptyDir data, lost with the pod), `phase` gains `CreateContainerConfigError`.

### Scenario, actions and faults

- `Scenario.ingressController?: boolean`.
- New actions: `rollout-restart <Deployment>`, `delete <kind> <name>` (any kind), `add-node <node>`, `edit-config <ConfigMap> <key> <value>`. `request` gains `from?`, `host?`, `path?`. A request with a host or path goes through the Ingress controller.
- No new faults.

### Timings (seconds; Kubernetes default in brackets)

Config sync 10 (about 60) · data tick 5 (1 record per second of running) · provisioning 3 · volume attach 2, Multi-Attach retry 5 · Job pod back-off 10 doubling (10, capped at 10 minutes) · CronJob check 10 (10) · DaemonSet and StatefulSet updates one pod at a time (maxUnavailable 1, the default).

## 2. Behaviour

### Config (`config.ts`, kubelet)

- At container start, the kubelet resolves `env` and `configMap` volumes. A missing ConfigMap, Secret or key leaves the pod in `CreateContainerConfigError` with Kubernetes' message (`configmap "web-config" not found`). The kubelet retries on every config sync.
- A volume-mounted ConfigMap is re-read on each config sync, so the app's `config` follows edits. Env values never change until the container restarts.
- `rollout-restart` sets `template.annotations.restartedAt` and goes through the phase 1 Deployment rollout unchanged.

### Volumes (`controllers/volumes.ts`, scheduler, kubelet, `storage.ts`)

- **PV controller:** binds each Pending PVC to the smallest Available PV with the same class and access mode and enough capacity, ties to the lowest name. If none fits and the PVC names a StorageClass, it provisions `pvc-<claim>` after 3 s. With no class and no fit, the PVC stays Pending ("no persistent volumes available for this claim and no storage class is set").
- **Reclaim:** deleting a Bound PVC applies the PV's `reclaimPolicy`: `Delete` removes the PV and its data; `Retain` leaves it `Released` with its records. A PVC used by a non-finished pod only gets `deleting: true` and goes when the last such pod is deleted.
- **Scheduler:** new filter `VolumeBinding`, before `NodeResourcesFit`: a pod whose claim is not Bound gets "pod has unbound immediate PersistentVolumeClaims".
- **Kubelet:** before pulling, it attaches each claim's PV to the node (2 s). A `ReadWriteOnce` PV already attached to another node, for a pod that is still running there, blocks with `Multi-Attach error for volume "<pv>": Volume is already used by pod(s) <pod>` and retries every 5 s. A PV detaches when no running pod on its node uses it.
- **Data tick** (every 5 s, only when some pod has a volume): each Running pod adds 5 records to each mounted PV, or to its own `records` for an emptyDir.

### StatefulSet (`controllers/statefulset.ts`)

- Pods are `<name>-0` … `<name>-(n−1)`, each with the PVC `<claim>-<name>-<i>` created from `claims`. A missing pod is recreated with the same name and reuses its PVC, so it gets its data back.
- `OrderedReady`: it creates ordinal i only when every lower ordinal is Running and ready. It scales down from the highest ordinal, one pod at a time, each only after the one before has gone. `Parallel` creates and deletes every pod at once.
- PVCs of scaled-down pods stay (`whenScaled: Retain`, the default) and are reused on scale-up. With `Delete`, they are deleted after their pod.
- Template change (`set-image`): a rolling update from the highest ordinal down. It deletes one pod, waits until its replacement is ready, then moves on.
- The headless Service gives each pod a stable DNS name (`db-0.db`), shown as a pod badge. No DNS is simulated.

### DaemonSet (`controllers/daemonset.ts`, scheduler, node lifecycle, drain)

- One pod per eligible node: Ready, matching `nodeSelector`, and with every NoSchedule/NoExecute taint tolerated. Each pod gets required node affinity on `kubernetes.io/hostname`. The scheduler now treats `kubernetes.io/hostname` as an implied node label.
- Created pods get the tolerations Kubernetes adds: `node.kubernetes.io/unschedulable:NoSchedule` and `not-ready` / `unreachable:NoExecute`. The scheduler's `NodeUnschedulable` filter lets a pod through when it tolerates the unschedulable taint. Node lifecycle no longer marks pods Lost when they tolerate `not-ready`.
- `add-node` creates a Ready node, and the DaemonSet adds a pod to it. A node that stops being eligible has its pod deleted.
- `drain` skips DaemonSet pods, as `--ignore-daemonsets` does. The lesson says real drain refuses without that flag.
- Template change: delete one old pod, wait until its replacement is ready, then the next node (name order).

### Job and CronJob (`controllers/job.ts`, `controllers/cronjob.ts`, kubelet)

- **Kubelet `run`:** the container exits after `seconds` with `exitCode` (1 while the owner has had fewer than `failFirst` failures). The phase 1 restart policy applies: `OnFailure` restarts in place, and each restart counts as a failure; `Never` leaves the pod `Failed`.
- **Job controller:** it keeps `min(parallelism, completions − succeeded − active)` new pods coming, with `ownerKind: 'Job'`. A failed pod is replaced after the back-off (10 s, 20 s, …). Failures above `backoffLimit` → condition `Failed`, reason `BackoffLimitExceeded`, active pods deleted. `activeDeadlineS` passed → `Failed`, `DeadlineExceeded`, active pods deleted. `succeeded ≥ completions` → `Complete`. A Job template with `restartPolicy: Always` is refused by the store: `Unsupported value: "Always": supported values: "OnFailure", "Never"`.
- **CronJob controller:** every 10 s it creates the Job `<name>-<minute>` for each due schedule time (`*/N` minutes from 0). `Allow` runs overlap; `Forbid` skips a run while one is active (narrated); `Replace` deletes the active Job and its pods first. After each Job finishes, it deletes the oldest finished Jobs (and their pods) beyond `successfulHistory` (3) and `failedHistory` (1).

### Ingress (`ingress.ts`, `route`)

- `matchIngress(ingresses, host, path)`: a rule's host must equal the request host, and a rule with no host matches any host. Among matching paths the longest wins, and at equal length `Exact` beats `Prefix`. `Prefix` matches whole path elements (`/api` matches `/api` and `/api/cart`, not `/apiary`). With no match, the request goes to `defaultBackend`, else gets `404 Not Found`.
- A matched Service with no endpoints → `503 Service Unavailable`. Otherwise one endpoint is picked as kube-proxy does today (the controller sends straight to pod IPs; the text says so).
- With `ingressController` off, an Ingress is stored but nothing serves it. Its row says "no address", and requests fail with "connection refused: no ingress controller is running".
- The step's `rules` table shows the Ingress rules, with the matched one highlighted.

### NetworkPolicy (`network.ts`, `route`)

- A pod is isolated for ingress (or egress) when some policy selects it and lists that type. An isolated pod accepts traffic only if some policy's rule for that direction matches the other pod. Rules add up across policies. `from: [[]]` (an empty selector) matches every pod.
- Requests with `from`: the source pod is the first Running pod whose name starts with `from`. Checks, in order:
  1. DNS: an egress-isolated source with no `dns: true` rule fails with `DNS lookup for <service> timed out`.
  2. The source's egress to the chosen endpoint.
  3. The endpoint's ingress.
  Traffic a policy denies is dropped, so the request fails with "connection timed out". The narration names the policies that isolated the pod.
- The step's `rules` table lists each policy, the pods it selects, and what it allows, with the deciding row highlighted.

### Operator (`controllers/operator.ts`)

- A `Database` write without the CRD is refused: `no matches for kind "Database" in version "example.com/v1": ensure CRDs are installed first`.
- The operator group (component `operator`) watches `Database`, `StatefulSet`, `Job` and `Pod`. It runs only while a pod of Deployment `db-operator` is Running and ready, and it runs once when that pod becomes ready (level-triggered catch-up).
- It reconciles each Database:
  - Ensure Secret `db-credentials`, headless Service `db`, and StatefulSet `db` (`postgres:<version>`, `replicas`, claim `data` 1 Gi from StorageClass `standard`).
  - Set any hand-made drift in the StatefulSet's replicas or image back to the spec.
  - On a version change with `backup`: create Job `db-backup-<version>` (runs 20 s), wait for `Complete` (status `BackingUp`), then update the image (status `Upgrading`, the StatefulSet's rolling update).
  - Write `status` (`Creating` until all replicas are ready, then `Ready`).

### Merged steps and narration

New trace kinds: `config`, `config-error`, `bind-volume`, `provision`, `attach`, `attach-fail`, `reclaim`, `job`, `cron`, `ingress`, `policy-drop`, `operator`, `node-join`, `records`. Each gets a `WHY` entry. `ownerOf` treats StatefulSet, DaemonSet and Job pods by their owner.

## 3. The `cluster` view

`ClusterView` gains optional fields only:

- Pods: `mounts?: string[]` (shown as badges, e.g. `data-db-0 · 45 records`, `config: color=green`, `emptyDir · 20 records`) and `dns?: string` (`db-0.db`).
- `objects` rows for ConfigMap (note `color=blue`), Secret (note `password: c2VjcmV0 (base64)`), PVC (note `Bound to pvc-data-db-0, 1Gi RWO`), PV (note `Released, 45 records`), StatefulSet and DaemonSet (desired / current / ready), Job (desired = completions, current = active, ready = succeeded, note `1 failed`, `Complete`), CronJob (note `*/1 * * * *, Forbid, last 120 s`), Ingress (note `2 rules` or `no address`), NetworkPolicy (note `selects app=api`), CRD, Database (desired = replicas, ready, note `Ready, v16`).
- `requests[].label` becomes the request itself (`GET shop.example.com/api/cart`, `frontend → api`), and requests gain `body?` (what the pod answered).
- `rules?: { title: string; columns: string[]; rows: { cells: string[]; role: Role }[] }`: one generic table, used by Ingress and NetworkPolicy steps. It is a new `RuleTable` component; the phase 2 `ScoringTable` stays as it is.

## 4. Lessons (Workloads & Operations, advanced)

| id | What the learner watches | Knobs | Presets |
|---|---|---|---|
| `configmaps-secrets` | Deployment `web` (2 replicas) reads `color` from ConfigMap `web-config` and a password from Secret `db`. Requests every 3 s show what each pod answers. At 20 s the ConfigMap changes blue → green. | consume as env / volume · rollout restart at 40 s off / on · ConfigMap present / created at 30 s | Env keeps the old value · Volume picks up the edit after the sync · Rollout restart picks it up · Missing ConfigMap blocks the start |
| `volumes-pv-pvc` | One `db` pod writing records; at 40 s its pod is deleted and replaced. | volume emptyDir / PVC · provisioning static PV / StorageClass / none · reclaimPolicy Delete / Retain · replicas 1 / 2 · at 60 s: nothing / scale to 0 and delete the PVC | emptyDir loses data · A PVC keeps it · No PV: everything Pending · Dynamic provisioning · Delete vs Retain · Two replicas, one RWO volume (Multi-Attach) |
| `statefulsets` | StatefulSet `db` with a headless Service and a claim per pod. | policy OrderedReady / Parallel · replicas 1–5 · event at 40 s: none / delete db-1 / scale to 1, back up at 80 s / set image v2 · db-1 never ready off / on | Ordered start · Parallel start · A deleted pod comes back with its name and data · Scale down and up keeps the PVCs · Rolling update from the top · A stuck db-1 blocks db-2 |
| `daemonsets` | DaemonSet `log-agent` on 3 nodes, node-3 tainted `gpu=true:NoSchedule`. | toleration off / on · nodeSelector none / disk=ssd · node-4 joins at 30 s off / on · drain node-1 at 50 s off / on · image update at 70 s off / on | One pod per node · A new node gets one · Taint and nodeSelector limit it · Drain leaves it in place · Rolling update node by node |
| `jobs-cronjobs` | A Job, or a CronJob that makes Jobs every minute. | mode Job / CronJob · completions 1–6 · parallelism 1–3 · failures none / first 2 fail / always fail / runs past a 60 s deadline · restartPolicy Never / OnFailure · concurrencyPolicy Allow / Forbid / Replace · run time 30 / 90 s | Parallel batch · Retries until it succeeds · Backoff limit exceeded · Deadline exceeded · CronJob every minute · Forbid skips overlapping runs · Replace cancels the old run |
| `ingress` | An Ingress for `shop.example.com`: `/` → web, `/api` → api. Requests to `/`, `/api/cart`, `/apiary`, `/api` and to `admin.example.com`. | /api pathType Prefix / Exact · default backend none / web · api replicas 0–2 · ingress controller on / off | Routes by path · Exact vs Prefix · Unknown host gets 404 · No endpoints: 503 · No ingress controller |
| `network-policies` | Pods `frontend`, `api`, `db` and `debug`. Requests: frontend → api, debug → api, api → db. | policies none / default deny / deny + allow frontend→api / … + allow api→db · egress deny on frontend off / on · allow DNS off / on | No policies: all traffic flows · Default deny blocks everything · Allow frontend to api · Egress deny breaks DNS · Allowing DNS fixes it |
| `operators-crds` | `db-operator` turns a `Database` into a Secret, Service and StatefulSet, then keeps them that way. | CRD installed / missing · at 60 s: nothing / replicas 3 → 5 / version 15 → 16 · backup before upgrade on / off · someone scales StatefulSet db to 1 at 40 s off / on · operator scaled to 0 from 50 s to 90 s off / on | The operator builds the database · No CRD: refused · Hand edits are put back · Upgrade with a backup first · Operator down: changes wait |

Every lesson has the same content sections as phases 1–2 (overview, concept, howItWorks, pseudocode with `codeLabel: 'Pseudocode'`, prosCons, applications, commonMistakes, a quiz of 4–5 questions with at least one `view`, summary). Each shortened timing is called out. Facts checked against kubernetes.io on 2026-10-24: StatefulSet OrderedReady and PVC Retain defaults; Job backoffLimit 6, back-off 10 s doubling capped at ten minutes; ConfigMap env vs volume updates; DaemonSet automatic tolerations; Ingress path precedence; NetworkPolicy isolation and additivity. The Ingress lesson says the Ingress API is frozen and that new work goes to the Gateway API. The plan's final task re-checks that wording.

## 5. Phase 2 deferred minors folded in

- The autoscaler's scale-down checks that each pod fits on one other node, not on the sum of free CPU across nodes.
- A failed startup probe is narrated as "Startup probe failed", not Liveness.
- `kubectl taint` with an existing key and effect replaces that taint instead of adding a duplicate.
- Setting a node's `memoryPressure` wakes the scheduler (a Node watch event).

Still deferred: a blocked drain keeps the run alive; a refused kill stops probes; unready pods are always evictable; narrow default whys; autoscaler lesson wording; a ReplicaSet restored by rollback keeps its old revision.

## 6. Testing

- **Unit:** config resolution and `CreateContainerConfigError`; env frozen vs volume refreshed on sync. PV binding (smallest fit, class, mode), provisioning delay, reclaim Delete vs Retain, in-use PVC protection, Multi-Attach and detach. StatefulSet ordering both ways, same name and claim on recreate, whenScaled, reverse rolling update. DaemonSet eligibility, add-node, taint, drain skip, node-lifecycle skip, rolling update. Job parallelism cap, back-off sequence, backoffLimit, deadline, completion. CronJob schedule times, the three concurrency policies, history limits. `matchIngress` (host, longest path, Exact over Prefix, element-wise prefix, default backend, 404). NetworkPolicy isolation, additivity, empty selectors, DNS. Operator CRD refusal, child creation, drift revert, backup-then-upgrade, outage catch-up.
- **Simulator:** same scenario → same frames with every new controller active. Phase 1–2 scenario and sim tests pass unchanged.
- **Scenario tests per lesson:** each preset's teaching moment, e.g. "env: every answer after 20 s is still blue", "PVC: the new pod starts with the old pod's records", "OrderedReady: db-2 is created only after db-1 is ready", "Forbid: no two Jobs active at once", "`/apiary` gets 404", "egress deny without DNS: every frontend request fails at DNS".
- **Contract:** the 8 lessons join `contract.test.ts`; new number fields get `RANGES`.
- **CI gates:** `npm run lint`, `npm test`, `npm run build:pages`, `npm run check:bundle` (600 kB first load; phase 2 left it at 561.7 kB).
- **Manual:** every preset in light and dark mode, at desktop and 375 px.

## Out of scope (phase 3)

Namespaces and `namespaceSelector` (text only); finalizers and Terminating pods; StatefulSet `partition` and `minReadySeconds` (text only); Indexed Jobs and pod failure policies; `startingDeadlineSeconds` and time zones in CronJobs; TLS on Ingress and the Gateway API (text only); egress to IP blocks; real DNS; volume snapshots and resizing; any custom kind other than `Database`.
